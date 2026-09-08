// API del mercato — svincolati (aste), scambi, giocatori proposti.
//
// Sostituisce integralmente il backend Airtable di new-mercato. Lì il browser
// parlava direttamente con Airtable portandosi dietro il token di scrittura e
// le password delle squadre dentro config.js, quindi chiunque aprisse il
// sorgente poteva scrivere sulla base e fare offerte a nome altrui. Qui il
// client non vede nessun segreto: parla solo con questa route, che riconosce
// la squadra dal cookie di sessione firmato di /api/state.
//
// Modello dati: liste Redis append-only. Le offerte sono eventi, non righe
// da aggiornare, quindi RPUSH (atomico) basta a gestire i rilanci simultanei —
// non serve né lock né scrittura ottimistica. Gli svincoli dichiarati sono una
// lista a parte con la stessa forma, ma con un vincolo in più: una riga sola
// per asta, e non si riscrive (vedi addSvincolo).
//
// Variabili d'ambiente: le stesse di /api/state (vedi app/lib/session.js).

import crypto from 'crypto';
import { TEAMS } from '../../lib/constants';
import {
  redis,
  currentTeam,
  json,
  configError,
  isAdmin,
  adminPinConfigured,
  adminPinState,
  adminPinMatches,
  setAdminSession,
  clearAdminSession,
  tooManyTries,
  noteFailure,
  clearFailures,
  ADMIN_PIN_MIN,
} from '../../lib/session';
import {
  LIMITS,
  cleanName,
  validateName,
  validateRoles,
  parseOffer,
  parseCredits,
  deriveAuctions,
  playerKey,
} from '../../lib/mercato';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEYS = {
  svincolati: 'asta2026:mercato:svincolati',
  scambi: 'asta2026:mercato:scambi',
  proposti: 'asta2026:mercato:proposti',
  // Dichiarazioni di svincolo: chi vince un'asta con la rosa piena scrive qui
  // chi libera. Lista a parte e non campo dell'offerta perche' le offerte sono
  // eventi immutabili — una dichiarazione invece si corregge.
  svincoli: 'asta2026:mercato:svincoli',
};

// Anti-spam: una scrittura ogni 3s per squadra. Non è una quota API come
// nell'originale (Redis è nostro), serve solo a evitare il doppio invio e le
// raffiche da tasto premuto.
const WRITE_COOLDOWN_S = 3;

/* ---------- storage ---------- */

async function readList(key) {
  const out = await redis(['LRANGE', key, '0', '-1']);
  const raw = Array.isArray(out.result) ? out.result : [];
  const records = [];
  for (const s of raw) {
    try {
      const r = JSON.parse(s);
      // Uno scarto dal passato o una riga corrotta non deve rompere la pagina.
      if (r && typeof r === 'object' && TEAMS.includes(r.team)) records.push(r);
    } catch {
      /* riga illeggibile: ignorata */
    }
  }
  return records;
}

async function append(key, record) {
  await redis(['RPUSH', key, JSON.stringify(record)]);
  // Tetto per lista: teniamo le più recenti, così la chiave non cresce all'infinito.
  await redis(['LTRIM', key, String(-LIMITS.recordsMax), '-1']);
}

// Cancellazione della propria riga. La lista contiene stringhe JSON: per
// rimuoverne una con LREM serve il valore esatto, quindi si rilegge il grezzo
// invece di ricostruirlo (una re-serializzazione potrebbe non combaciare).
async function removeOwn(key, id, team) {
  const out = await redis(['LRANGE', key, '0', '-1']);
  const raw = Array.isArray(out.result) ? out.result : [];
  for (const s of raw) {
    let r;
    try { r = JSON.parse(s); } catch { continue; }
    if (r?.id !== id) continue;
    if (r.team !== team) return { error: 'Puoi cancellare solo le tue righe.', status: 403 };
    await redis(['LREM', key, '1', s]);
    return { ok: true };
  }
  return { error: 'Riga non trovata.', status: 404 };
}

/* ---------- scrittura del backoffice ---------- */

// Applica una modifica parziale a una riga, validando come se fosse un nuovo
// inserimento. L'admin puo' correggere anche la squadra (capita che qualcuno
// invii dal profilo sbagliato), ma non l'id ne' la data: l'id serve a
// ritrovare la riga, e la data e' l'istante in cui l'evento e' successo, non un
// campo redazionale — sulle aste e' anche cio' che fa partire le 24 ore.
// I campi assenti dal patch restano come sono.
function applyPatch(lista, record, patch) {
  const out = { ...record };
  const has = (k) => Object.prototype.hasOwnProperty.call(patch, k);

  if (has('team')) {
    if (!TEAMS.includes(patch.team)) return { error: 'Squadra non valida.', status: 400 };
    out.team = patch.team;
  }

  if (lista === 'svincolati') {
    if (has('nome')) {
      const err = validateName(patch.nome);
      if (err) return { error: err, status: 400 };
      out.nome = cleanName(patch.nome);
    }
    if (has('offerta')) {
      const offerta = parseOffer(patch.offerta);
      if (offerta === null) {
        return { error: `Offerta non valida (da ${LIMITS.offertaMin} a ${LIMITS.offertaMax}).`, status: 400 };
      }
      out.offerta = offerta;
    }
    return { record: out };
  }

  if (lista === 'scambi') {
    if (has('ricevente')) {
      if (!TEAMS.includes(patch.ricevente)) return { error: 'Squadra ricevente non valida.', status: 400 };
      out.ricevente = patch.ricevente;
    }
    for (const campo of ['giocatoreOfferto', 'giocatoreRichiesto']) {
      if (!has(campo)) continue;
      const err = validateName(patch[campo]);
      if (err) return { error: err, status: 400 };
      out[campo] = cleanName(patch[campo]);
    }
    for (const campo of ['creditiOfferti', 'creditiRichiesti']) {
      if (!has(campo)) continue;
      const v = parseCredits(patch[campo]);
      if (patch[campo] !== '' && patch[campo] !== null && v === null) {
        return { error: 'Crediti non validi.', status: 400 };
      }
      out[campo] = v;
    }
    if (out.team === out.ricevente) {
      return { error: 'Proponente e ricevente non possono essere la stessa squadra.', status: 400 };
    }
    return { record: out };
  }

  if (lista === 'svincoli') {
    if (has('nome')) {
      const err = validateName(patch.nome);
      if (err) return { error: err, status: 400 };
      out.nome = cleanName(patch.nome);
    }
    return { record: out };
  }

  // proposti
  if (has('nome')) {
    const err = validateName(patch.nome);
    if (err) return { error: err, status: 400 };
    out.nome = cleanName(patch.nome);
  }
  if (has('ruoli')) {
    const err = validateRoles(patch.ruoli);
    if (err) return { error: err, status: 400 };
    out.ruoli = patch.ruoli;
  }
  return { record: out };
}



// Modifica una riga per id. Le liste Redis non si indirizzano per id ma per
// indice, e l'indice puo' spostarsi sotto di noi: se nel frattempo una squadra
// ritira la propria offerta (LREM) tutte le righe successive scalano di uno, e
// una LSET fatta sull'indice letto prima riscriverebbe la riga sbagliata.
// Per questo, appena prima di scrivere, si ricontrolla con LINDEX che a
// quell'indice ci sia ancora esattamente la riga letta; se non c'e' piu' si
// rilegge da capo. Tre tentativi, poi si rinuncia invece di scrivere alla cieca.
async function updateById(key, id, mutate) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await redis(['LRANGE', key, '0', '-1']);
    const raw = Array.isArray(out.result) ? out.result : [];

    let index = -1;
    let current = null;
    for (let i = 0; i < raw.length; i++) {
      try {
        if (JSON.parse(raw[i])?.id === id) { index = i; current = raw[i]; break; }
      } catch { /* riga illeggibile: ignorata */ }
    }
    if (index < 0) return { error: 'Riga non trovata.', status: 404 };

    const result = mutate(JSON.parse(current));
    if (result.error) return result;

    const check = await redis(['LINDEX', key, String(index)]);
    if (check.result !== current) continue; // la lista e' cambiata: rileggi

    await redis(['LSET', key, String(index), JSON.stringify(result.record)]);
    return { ok: true, record: result.record };
  }
  return { error: 'La lista e\' cambiata durante la modifica. Riprova.', status: 409 };
}

// Cancellazione senza vincolo di proprieta': solo il backoffice la usa.
async function removeAny(key, id) {
  const out = await redis(['LRANGE', key, '0', '-1']);
  const raw = Array.isArray(out.result) ? out.result : [];
  for (const line of raw) {
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r?.id !== id) continue;
    await redis(['LREM', key, '1', line]);
    return { ok: true };
  }
  return { error: 'Riga non trovata.', status: 404 };
}

// Le aste sono raggruppate per nome del giocatore: correggere un refuso su una
// sola offerta la staccherebbe dalle altre, creando un'asta parallela con un
// rilancio solo. Quindi il nuovo nome si propaga a tutte le offerte che stavano
// nella stessa asta. Ritorna quante righe ha toccato, oltre a quella modificata.
async function renameAuction(oldKey, newName, skipId) {
  const out = await redis(['LRANGE', KEYS.svincolati, '0', '-1']);
  const raw = Array.isArray(out.result) ? out.result : [];
  let touched = 0;

  for (let i = 0; i < raw.length; i++) {
    let r;
    try { r = JSON.parse(raw[i]); } catch { continue; }
    if (r?.id === skipId || playerKey(r?.nome) !== oldKey) continue;

    const updated = JSON.stringify({ ...r, nome: newName });
    const check = await redis(['LINDEX', KEYS.svincolati, String(i)]);
    if (check.result !== raw[i]) continue;
    await redis(['LSET', KEYS.svincolati, String(i), updated]);
    touched++;
  }
  return touched;
}

// Le aste servono quasi sempre insieme alle dichiarazioni di svincolo: sono
// quelle a dire se un'asta chiusa è conclusa o annullata.
async function readAuctions() {
  const [offerte, svincoli] = await Promise.all([
    readList(KEYS.svincolati),
    readList(KEYS.svincoli),
  ]);
  return deriveAuctions(offerte, Date.now(), svincoli);
}

// Quando un'asta si annulla il giocatore torna disponibile, e disponibile vuol
// dire davvero da capo: le vecchie offerte se ne vanno, altrimenti la prima
// nuova offerta finirebbe nello stesso mucchio e l'asta ricomparirebbe scaduta.
// Si fa qui e non con un lavoro pianificato perché non c'è nessuno a farlo
// girare: il momento in cui serve è esattamente quello in cui qualcuno riprova
// a offrire.
async function purgeAuction(key) {
  const out = await redis(['LRANGE', KEYS.svincolati, '0', '-1']);
  const raw = Array.isArray(out.result) ? out.result : [];
  let tolte = 0;
  for (const line of raw) {
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (playerKey(r?.nome) !== key) continue;
    await redis(['LREM', KEYS.svincolati, '1', line]);
    tolte++;
  }
  return tolte;
}

/* ---------- svincoli dichiarati ---------- */

// Si scrive una volta sola. Lo svincolo è un impegno verso le altre squadre,
// non un appunto privato: se si potesse riscrivere, chi si è aggiudicato il
// giocatore potrebbe cambiare idea dopo aver visto come si muovono gli altri,
// e la riga non varrebbe più niente. Quindi la seconda dichiarazione sulla
// stessa asta viene rifiutata; per correggere un refuso c'è il backoffice.
//
// Due invii simultanei della stessa squadra passerebbero entrambi il
// controllo, ma non ci arrivano: il cooldown per squadra (WRITE_COOLDOWN_S)
// scarta il secondo prima di qui.
async function addSvincolo(astaKey, team, nome) {
  const out = await redis(['LRANGE', KEYS.svincoli, '0', '-1']);
  const raw = Array.isArray(out.result) ? out.result : [];

  for (const line of raw) {
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r?.asta === astaKey && r?.team === team) {
      return {
        error: r.nessuno
          ? 'Hai già dichiarato che non devi svincolare nessuno.'
          : `Hai già dichiarato ${r.nome}: lo svincolo si indica una volta sola.`,
        status: 409,
      };
    }
  }

  await append(KEYS.svincoli, {
    id: crypto.randomUUID(),
    team,
    asta: astaKey,
    // nessuno = "la rosa era già a posto". Sta come riga in lista e non come
    // assenza di riga perché è una risposta data, non una risposta mancante:
    // è esattamente ciò che distingue un'asta conclusa da una annullata.
    nome,
    nessuno: !nome,
    data: new Date().toISOString(),
  });
  return { ok: true };
}

async function readAll() {
  const [svincolati, scambi, proposti, svincoli] = await Promise.all([
    readList(KEYS.svincolati),
    readList(KEYS.scambi),
    readList(KEYS.proposti),
    readList(KEYS.svincoli),
  ]);
  return { svincolati, scambi, proposti, svincoli, updated: new Date().toISOString() };
}

async function hitCooldown(team) {
  const k = `asta2026:mercato:cd:${crypto.createHash('sha256').update(team).digest('hex').slice(0, 16)}`;
  // SET NX EX: se la chiave esiste già la scrittura è troppo ravvicinata.
  const out = await redis(['SET', k, '1', 'NX', 'EX', String(WRITE_COOLDOWN_S)]);
  return out.result === null;
}

/* ---------- lettura: pubblica, come /api/state ---------- */

export async function GET(request) {
  const bad = configError();
  if (bad) return bad;
  try {
    return json({
      team: currentTeam(request),
      admin: isAdmin(request),
      adminAvailable: adminPinConfigured(),
      adminStatus: adminPinState(),
      mercato: await readAll(),
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}

/* ---------- scrittura: solo con sessione valida ---------- */

export async function POST(request) {
  const bad = configError();
  if (bad) return bad;

  const action = request.nextUrl.searchParams.get('action') || '';

  try {
    /* --- backoffice: accesso --- */
    // Sta prima del controllo sulla sessione di squadra perche' l'admin non e'
    // una squadra: ha un PIN suo e un cookie suo.
    if (action === 'admin-login') {
      const state = adminPinState();
      if (state !== 'ok') {
        return json({
          error: state === 'short'
            ? `ADMIN_PIN è impostata ma è troppo corta: servono almeno ${ADMIN_PIN_MIN} caratteri.`
            : 'Backoffice non configurato: manca ADMIN_PIN.',
        }, 503);
      }
      if (await tooManyTries(request, 'atry')) {
        return json({ error: 'Troppi tentativi falliti. Riprova tra 15 minuti.' }, 429);
      }
      const { pin } = (await request.json().catch(() => ({}))) || {};
      if (!adminPinMatches(pin)) {
        await noteFailure(request, 'atry');
        return json({ error: 'Codice non valido.' }, 401);
      }
      await clearFailures(request, 'atry');
      const res = json({ admin: true, mercato: await readAll() });
      setAdminSession(res);
      return res;
    }

    if (action === 'admin-logout') {
      const res = json({ ok: true });
      clearAdminSession(res);
      return res;
    }

    /* --- backoffice: modifica e cancellazione di qualunque riga --- */
    if (action === 'admin-edit' || action === 'admin-del') {
      if (!isAdmin(request)) {
        return json({ error: 'Sessione del backoffice scaduta. Rientra col codice.' }, 401);
      }
      const body = (await request.json().catch(() => ({}))) || {};
      const key = KEYS[body.lista];
      if (!key) return json({ error: 'Lista non valida.' }, 400);
      if (typeof body.id !== 'string' || !body.id) return json({ error: 'Id mancante.' }, 400);

      if (action === 'admin-del') {
        const res = await removeAny(key, body.id);
        if (res.error) return json({ error: res.error }, res.status);
        return json({ admin: true, mercato: await readAll() });
      }

      let oldPlayerKey = null;
      let newName = null;

      const res = await updateById(key, body.id, (record) => {
        const patched = applyPatch(body.lista, record, body.patch || {});
        if (patched.error) return patched;
        if (body.lista === 'svincolati' && playerKey(record.nome) !== playerKey(patched.record.nome)) {
          oldPlayerKey = playerKey(record.nome);
          newName = patched.record.nome;
        }
        return patched;
      });
      if (res.error) return json({ error: res.error }, res.status);

      // il nome e' cambiato: porta con se' il resto dell'asta
      const renamed = oldPlayerKey ? await renameAuction(oldPlayerKey, newName, body.id) : 0;
      return json({ admin: true, renamed, mercato: await readAll() });
    }

    // L'identità viene dal cookie firmato, mai dal body: non si può offrire a
    // nome di un'altra squadra nemmeno modificando la richiesta a mano.
    const team = currentTeam(request);
    if (!team) {
      return json({ error: 'Sessione scaduta. Inserisci di nuovo il PIN.' }, 401);
    }

    const body = (await request.json().catch(() => ({}))) || {};

    if (action !== 'del' && (await hitCooldown(team))) {
      return json({ error: 'Troppo veloce: aspetta qualche secondo.' }, 429);
    }

    /* --- offerta per uno svincolato --- */
    if (action === 'offerta') {
      const nameErr = validateName(body.nome);
      if (nameErr) return json({ error: nameErr }, 400);

      const offerta = parseOffer(body.offerta);
      if (offerta === null) {
        return json({ error: `Offerta non valida (da ${LIMITS.offertaMin} a ${LIMITS.offertaMax}).` }, 400);
      }

      // Due controlli che nell'app originale non c'erano: lì il form accettava
      // qualunque offerta, anche su un'asta già scaduta o più bassa di quella
      // in testa, e la riga finiva comunque su Airtable come rumore.
      const nome = cleanName(body.nome);
      const key = playerKey(nome);
      const existing = (await readAuctions()).find((a) => a.key === key);

      if (existing?.phase === 'annullata') {
        // Il giocatore è di nuovo libero: si fa piazza pulita e questa offerta
        // è la prima di un'asta nuova, con 24 ore tutte sue.
        await purgeAuction(key);
      } else if (existing) {
        if (existing.phase === 'conclusa') {
          return json({ error: `Asta chiusa: ${existing.displayName} è andato a ${existing.leadingTeam}.` }, 409);
        }
        if (existing.phase === 'attesa') {
          return json(
            { error: `${existing.displayName} è andato a ${existing.leadingTeam}: si aspetta che dichiari lo svincolo.` },
            409
          );
        }
        if (offerta <= existing.highestBid) {
          return json(
            { error: `Devi superare l'offerta in testa (${existing.highestBid} da ${existing.leadingTeam}).` },
            409
          );
        }
      }

      const record = {
        id: crypto.randomUUID(),
        team,
        nome,
        offerta,
        data: new Date().toISOString(),
      };
      await append(KEYS.svincolati, record);
      return json({ team, mercato: await readAll() });
    }

    /* --- rilancio su un'asta già aperta --- */
    // Il nome del giocatore NON arriva dal client: si prende dall'asta stessa.
    // Prima l'unico modo di rilanciare era riscrivere il nome identico nel form,
    // e un carattere diverso apriva un'asta parallela invece di rilanciare.
    if (action === 'rilancio') {
      const chiave = String(body.asta || '');
      if (!chiave) return json({ error: 'Asta non indicata.' }, 400);

      const offerta = parseOffer(body.offerta);
      if (offerta === null) {
        return json({ error: `Offerta non valida (da ${LIMITS.offertaMin} a ${LIMITS.offertaMax}).` }, 400);
      }

      const asta = (await readAuctions()).find((a) => a.key === chiave);
      if (!asta) return json({ error: 'Asta non trovata.' }, 404);
      if (asta.phase === 'annullata') {
        return json({ error: `Asta annullata: rifai un'offerta su ${asta.displayName} dal form.` }, 409);
      }
      if (asta.closed) {
        return json({ error: `Asta chiusa: ${asta.displayName} è andato a ${asta.leadingTeam}.` }, 409);
      }
      if (offerta <= asta.highestBid) {
        return json(
          { error: `Devi superare l'offerta in testa (${asta.highestBid} da ${asta.leadingTeam}).` },
          409
        );
      }

      const record = {
        id: crypto.randomUUID(),
        team,
        nome: asta.displayName,   // nome canonico dell'asta, non quello digitato
        offerta,
        data: new Date().toISOString(),
      };
      await append(KEYS.svincolati, record);
      return json({ team, mercato: await readAll() });
    }

    /* --- giocatore da svincolare per l'asta vinta --- */
    // Chi si aggiudica un giocatore con la rosa piena deve liberare uno slot.
    // Finora quel nome girava a voce nel gruppo e non risultava da nessuna
    // parte: qui sta attaccato all'asta che lo ha reso necessario, e lo vedono
    // tutti. Lo scrive solo chi ha vinto, solo quando l'asta e' chiusa (prima
    // non c'e' niente da svincolare) e una volta sola: vedi addSvincolo().
    if (action === 'svincolo') {
      const chiave = String(body.asta || '');
      if (!chiave) return json({ error: 'Asta non indicata.' }, 400);

      const asta = (await readAuctions()).find((a) => a.key === chiave);
      if (!asta) return json({ error: 'Asta non trovata.' }, 404);
      if (asta.leadingTeam !== team) {
        return json(
          { error: `${asta.displayName} è andato a ${asta.leadingTeam}: lo svincolo lo indica chi si è aggiudicato il giocatore.` },
          403
        );
      }
      if (asta.phase === 'aperta') {
        return json({ error: 'L’asta è ancora aperta: lo svincolo si indica quando è aggiudicata.' }, 409);
      }
      // Fuori tempo massimo. È il controllo che rende vere le 6 ore: senza,
      // basterebbe tenere la pagina aperta e dichiarare con calma domani.
      if (asta.phase === 'annullata') {
        return json(
          { error: `Le 6 ore sono passate: l’asta è annullata e ${asta.displayName} è tornato fra gli svincolati.` },
          409
        );
      }
      if (asta.phase === 'conclusa') {
        return json(
          { error: asta.svincolo?.nessuno
            ? 'Hai già dichiarato che non devi svincolare nessuno.'
            : `Hai già dichiarato ${asta.svincolo?.nome}: lo svincolo si indica una volta sola.` },
          409
        );
      }

      // Due risposte valide: un nome, oppure "non devo svincolare nessuno".
      // Chiudono l'asta allo stesso modo, e nessuna delle due si ritratta.
      const nessuno = body.nessuno === true;
      const nome = nessuno ? '' : cleanName(body.nome);
      if (!nessuno) {
        const nameErr = validateName(nome);
        if (nameErr) return json({ error: nameErr }, 400);
      }

      const res = await addSvincolo(chiave, team, nome);
      if (res.error) return json({ error: res.error }, res.status);
      return json({ team, mercato: await readAll() });
    }

    /* --- proposta di scambio --- */
    if (action === 'scambio') {
      const ricevente = String(body.ricevente || '');
      if (!TEAMS.includes(ricevente)) return json({ error: 'Squadra ricevente non valida.' }, 400);
      if (ricevente === team) return json({ error: 'Non puoi proporre uno scambio a te stesso.' }, 400);

      const offErr = validateName(body.giocatoreOfferto);
      if (offErr) return json({ error: `Giocatore offerto: ${offErr.toLowerCase()}` }, 400);
      const richErr = validateName(body.giocatoreRichiesto);
      if (richErr) return json({ error: `Giocatore richiesto: ${richErr.toLowerCase()}` }, 400);

      const creditiOfferti = parseCredits(body.creditiOfferti);
      const creditiRichiesti = parseCredits(body.creditiRichiesti);
      if (body.creditiOfferti && creditiOfferti === null) {
        return json({ error: 'Crediti offerti non validi.' }, 400);
      }
      if (body.creditiRichiesti && creditiRichiesti === null) {
        return json({ error: 'Crediti richiesti non validi.' }, 400);
      }

      const record = {
        id: crypto.randomUUID(),
        team,                      // squadra proponente
        ricevente,
        giocatoreOfferto: cleanName(body.giocatoreOfferto),
        giocatoreRichiesto: cleanName(body.giocatoreRichiesto),
        creditiOfferti,
        creditiRichiesti,
        data: new Date().toISOString(),
      };
      await append(KEYS.scambi, record);
      return json({ team, mercato: await readAll() });
    }

    /* --- giocatore messo a disposizione --- */
    if (action === 'proposta') {
      const nameErr = validateName(body.nome);
      if (nameErr) return json({ error: nameErr }, 400);

      const ruoli = Array.isArray(body.ruoli) ? body.ruoli : [];
      const roleErr = validateRoles(ruoli);
      if (roleErr) return json({ error: roleErr }, 400);

      const record = {
        id: crypto.randomUUID(),
        team,
        nome: cleanName(body.nome),
        ruoli,
        data: new Date().toISOString(),
      };
      await append(KEYS.proposti, record);
      return json({ team, mercato: await readAll() });
    }

    /* --- cancellazione di una propria riga --- */
    if (action === 'del') {
      const key = KEYS[body.lista];
      if (!key) return json({ error: 'Lista non valida.' }, 400);
      // Gli svincoli no: cancellare la propria riga e riscriverla sarebbe il
      // modo piu' comodo per cambiare idea, che e' esattamente cio' che
      // addSvincolo() impedisce dalla porta principale.
      if (body.lista === 'svincoli') {
        return json({ error: 'Lo svincolo dichiarato non si cancella: scrivi a chi gestisce il mercato.' }, 403);
      }
      if (typeof body.id !== 'string' || !body.id) return json({ error: 'Id mancante.' }, 400);

      const res = await removeOwn(key, body.id, team);
      if (res.error) return json({ error: res.error }, res.status);
      return json({ team, mercato: await readAll() });
    }

    return json({ error: 'Azione non valida.' }, 400);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
