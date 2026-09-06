// API del mercato — svincolati (aste), scambi, giocatori proposti.
//
// Sostituisce integralmente il backend Airtable di new-mercato. Lì il browser
// parlava direttamente con Airtable portandosi dietro il token di scrittura e
// le password delle squadre dentro config.js, quindi chiunque aprisse il
// sorgente poteva scrivere sulla base e fare offerte a nome altrui. Qui il
// client non vede nessun segreto: parla solo con questa route, che riconosce
// la squadra dal cookie di sessione firmato di /api/state.
//
// Modello dati: tre liste Redis append-only. Le offerte sono eventi, non righe
// da aggiornare, quindi RPUSH (atomico) basta a gestire i rilanci simultanei —
// non serve né lock né scrittura ottimistica.
//
// Variabili d'ambiente: le stesse di /api/state (vedi app/lib/session.js).

import crypto from 'crypto';
import { TEAMS } from '../../lib/constants';
import { redis, currentTeam, json, configError } from '../../lib/session';
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

async function readAll() {
  const [svincolati, scambi, proposti] = await Promise.all([
    readList(KEYS.svincolati),
    readList(KEYS.scambi),
    readList(KEYS.proposti),
  ]);
  return { svincolati, scambi, proposti, updated: new Date().toISOString() };
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
    return json({ team: currentTeam(request), mercato: await readAll() });
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
