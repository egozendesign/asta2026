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
// non serve né lock né scrittura ottimistica. L'unica eccezione sono gli
// svincoli dichiarati: lì la riga si riscrive, e il perché è spiegato su
// upsertSvincolo().
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

/* ---------- svincoli dichiarati ---------- */

// A differenza di un'offerta, la dichiarazione di svincolo non è un evento: è
// un campo che la squadra corregge finché non è quello giusto. Accodarne una
// nuova a ogni modifica lascerebbe in lista tutte le versioni precedenti e
// costringerebbe a indovinare quale vale, quindi ne esiste al massimo una per
// coppia asta+squadra e la si riscrive sul posto.
// Il controllo con LINDEX prima di LSET è lo stesso di updateById(): l'indice
// letto può spostarsi se nel frattempo sparisce una riga più in alto.
async function upsertSvincolo(astaKey, team, nome) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await redis(['LRANGE', KEYS.svincoli, '0', '-1']);
    const raw = Array.isArray(out.result) ? out.result : [];

    let index = -1;
    let current = null;
    for (let i = 0; i < raw.length; i++) {
      let r;
      try { r = JSON.parse(raw[i]); } catch { continue; }
      if (r?.asta === astaKey && r?.team === team) { index = i; current = raw[i]; break; }
    }

    if (index < 0) {
      await append(KEYS.svincoli, {
        id: crypto.randomUUID(),
        team,
        asta: astaKey,
        nome,
        data: new Date().toISOString(),
      });
      return { ok: true };
    }

    const record = { ...JSON.parse(current), nome, data: new Date().toISOString() };
    const check = await redis(['LINDEX', KEYS.svincoli, String(index)]);
    if (check.result !== current) continue; // la lista e' cambiata: rileggi
    await redis(['LSET', KEYS.svincoli, String(index), JSON.stringify(record)]);
    return { ok: true };
  }
  return { error: 'La lista e\' cambiata durante la modifica. Riprova.', status: 409 };
}

// Campo svuotato: la squadra sta dicendo che non deve svincolare nessuno.
// Niente riga vuota in lista, si toglie e basta.
async function removeSvincolo(astaKey, team) {
  const out = await redis(['LRANGE', KEYS.svincoli, '0', '-1']);
  const raw = Array.isArray(out.result) ? out.result : [];
  for (const line of raw) {
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r?.asta !== astaKey || r?.team !== team) continue;
    await redis(['LREM', KEYS.svincoli, '1', line]);
    return { ok: true };
  }
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
      const existing = deriveAuctions(await readList(KEYS.svincolati)).find((a) => a.key === key);

      if (existing?.closed) {
        return json({ error: `Asta chiusa: ${existing.displayName} è andato a ${existing.leadingTeam}.` }, 409);
      }
      if (existing && offerta <= existing.highestBid) {
        return json(
          { error: `Devi superare l'offerta in testa (${existing.highestBid} da ${existing.leadingTeam}).` },
          409
        );
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

      const asta = deriveAuctions(await readList(KEYS.svincolati)).find((a) => a.key === chiave);
      if (!asta) return json({ error: 'Asta non trovata.' }, 404);
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
    // tutti. Lo scrive solo chi ha vinto, e solo quando l'asta e' chiusa —
    // prima non c'e' niente da svincolare.
    if (action === 'svincolo') {
      const chiave = String(body.asta || '');
      if (!chiave) return json({ error: 'Asta non indicata.' }, 400);

      const asta = deriveAuctions(await readList(KEYS.svincolati)).find((a) => a.key === chiave);
      if (!asta) return json({ error: 'Asta non trovata.' }, 404);
      if (!asta.closed) {
        return json({ error: 'L’asta è ancora aperta: lo svincolo si indica quando è aggiudicata.' }, 409);
      }
      if (asta.leadingTeam !== team) {
        return json(
          { error: `${asta.displayName} è andato a ${asta.leadingTeam}: lo svincolo lo indica chi si è aggiudicato il giocatore.` },
          403
        );
      }

      // Campo svuotato = nessuno da svincolare: e' una risposta valida, non un
      // errore di compilazione.
      const nome = cleanName(body.nome);
      if (!nome) {
        await removeSvincolo(chiave, team);
        return json({ team, mercato: await readAll() });
      }

      const nameErr = validateName(nome);
      if (nameErr) return json({ error: nameErr }, 400);

      const res = await upsertSvincolo(chiave, team, nome);
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
