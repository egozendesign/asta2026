// API condivisa con autenticazione PIN per squadra — versione Next.js (App Router).
// Migrata da api/state.js: stessa identica logica di sicurezza, cambia solo il
// "guscio" (Request/Response Web al posto di req/res di Vercel).
//
// Variabili d'ambiente richieste su Vercel (INVARIATE, restano nelle env di Vercel):
//   KV_REST_API_URL     (dall'integrazione Upstash Redis)
//   KV_REST_API_TOKEN   (dall'integrazione Upstash Redis)
//   TEAM_PINS           JSON: {"Pandamonio":"1234", ...}
//   SESSION_SECRET      stringa random lunga (>= 32 caratteri)

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { TEAMS } from '../../lib/constants';

// crypto (Node) + niente cache: questa route è sempre dinamica.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const URL_BASE = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;
const SECRET = process.env.SESSION_SECRET || '';
const KEY = 'asta2026:state';

// campi a scelta chiusa + valori ammessi; i campi liberi sono in FREE_TEXT
const ALLOWED = {
  loc: ['teatro', 'altra'],
  orari: ['19', '20'],
  nec: ['si', 'no'],
  mercato: ['favorevole', 'contrario'],
};
const FREE_TEXT = ['necNote', 'locNote'];
const MAX_TEXT = 300;

// proposte di modifica del regolamento: lista condivisa, non una riga per squadra
const RULE_VOTES = ['up', 'down'];
const MAX_RULE_TITLE = 90;
const MAX_RULE_TEXT = 700;
const MAX_RULE_NOTE = 300;
const MAX_RULES_PER_TEAM = 5;
const MAX_RULES = 40;

const MAX_TRIES = 8;          // tentativi PIN falliti consentiti
const LOCK_WINDOW = 15 * 60;  // finestra di blocco, in secondi
const SESSION_DAYS = 30;
const COOKIE = 'asta_sess';

/* ---------- storage ---------- */

async function redis(cmd) {
  const res = await fetch(URL_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  return res.json();
}

function emptyState() {
  return { loc: {}, locNote: {}, orari: {}, nec: {}, necNote: {}, mercato: {}, regole: [], updated: null };
}

// I voti per "cesano" (location non più disponibile) vengono scartati in lettura:
// chi aveva votato così risulta semplicemente senza voto e può rivotare.
// Le proposte di regolamento vengono ripulite di squadre/voti non più validi:
// lo stato vive su Redis e può contenere roba scritta da versioni precedenti.
function normalize(s) {
  for (const team of Object.keys(s.loc)) {
    if (!ALLOWED.loc.includes(s.loc[team])) delete s.loc[team];
  }
  s.regole = Array.isArray(s.regole)
    ? s.regole
        .filter((r) => r && typeof r.id === 'string' && TEAMS.includes(r.team))
        .map((r) => {
          const votes = {};
          for (const [team, v] of Object.entries(r.votes || {})) {
            if (TEAMS.includes(team) && RULE_VOTES.includes(v)) votes[team] = v;
          }
          return {
            id: r.id,
            team: r.team,
            title: String(r.title || '').slice(0, MAX_RULE_TITLE),
            text: String(r.text || '').slice(0, MAX_RULE_TEXT),
            note: String(r.note || '').slice(0, MAX_RULE_NOTE),
            created: r.created || null,
            votes,
          };
        })
    : [];
  return s;
}

async function readState() {
  const out = await redis(['GET', KEY]);
  if (!out.result) return emptyState();
  try {
    return normalize({ ...emptyState(), ...JSON.parse(out.result) });
  } catch {
    return emptyState();
  }
}

async function writeState(s) {
  await redis(['SET', KEY, JSON.stringify(s)]);
}

/* ---------- PIN ---------- */

function pins() {
  try {
    return JSON.parse(process.env.TEAM_PINS || '{}');
  } catch {
    return {};
  }
}

// confronto a tempo costante: non rivela quante cifre sono corrette
function pinMatches(input, expected) {
  const a = Buffer.from(String(input));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a); // consuma comunque tempo
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function clientKey(request) {
  const fwd = request.headers.get('x-forwarded-for') || '';
  return crypto
    .createHash('sha256')
    .update(String(fwd).split(',')[0].trim() || 'unknown')
    .digest('hex')
    .slice(0, 16);
}

async function tooManyTries(request) {
  const out = await redis(['GET', `asta2026:try:${clientKey(request)}`]);
  return Number(out.result || 0) >= MAX_TRIES;
}

async function noteFailure(request) {
  const k = `asta2026:try:${clientKey(request)}`;
  await redis(['INCR', k]);
  await redis(['EXPIRE', k, String(LOCK_WINDOW)]);
}

async function clearFailures(request) {
  await redis(['DEL', `asta2026:try:${clientKey(request)}`]);
}

/* ---------- sessione (cookie firmato HMAC) ---------- */

function sign(team, exp) {
  const payload = `${Buffer.from(team).toString('base64url')}.${exp}`;
  const mac = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

function verify(cookieValue) {
  if (!cookieValue || !SECRET) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return null;
  const [b64, exp, mac] = parts;
  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(`${b64}.${exp}`)
    .digest('base64url');
  const A = Buffer.from(mac);
  const B = Buffer.from(expected);
  if (A.length !== B.length || !crypto.timingSafeEqual(A, B)) return null;
  if (Number(exp) < Date.now()) return null;
  const team = Buffer.from(b64, 'base64url').toString();
  return TEAMS.includes(team) ? team : null;
}

function cookieOptions(maxAge) {
  return { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge };
}

function setSession(res, team) {
  const exp = Date.now() + SESSION_DAYS * 86400 * 1000;
  res.cookies.set(COOKIE, sign(team, exp), cookieOptions(SESSION_DAYS * 86400));
}

function clearSession(res) {
  res.cookies.set(COOKIE, '', cookieOptions(0));
}

function json(body, status = 200) {
  const res = NextResponse.json(body, { status });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

function configError() {
  if (!URL_BASE || !TOKEN || !SECRET) {
    return json(
      { error: 'Configurazione incompleta: servono KV_REST_API_URL, KV_REST_API_TOKEN e SESSION_SECRET.' },
      500
    );
  }
  return null;
}

/* ---------- lettura: pubblica, chi ha il link vede i risultati ---------- */

export async function GET(request) {
  const bad = configError();
  if (bad) return bad;
  try {
    const team = verify(request.cookies.get(COOKIE)?.value);
    return json({ team, state: await readState() });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}

/* ---------- login / logout / scrittura ---------- */

export async function POST(request) {
  const bad = configError();
  if (bad) return bad;

  const action = request.nextUrl.searchParams.get('action') || '';

  try {
    /* --- login --- */
    if (action === 'login') {
      if (await tooManyTries(request)) {
        return json({ error: 'Troppi tentativi falliti. Riprova tra 15 minuti.' }, 429);
      }
      const body = await request.json().catch(() => ({}));
      const { team, pin } = body || {};

      if (!TEAMS.includes(team) || !/^\d{4}$/.test(String(pin || ''))) {
        await noteFailure(request);
        return json({ error: 'Squadra o PIN non validi.' }, 401);
      }
      const expected = pins()[team];
      if (!expected || !pinMatches(pin, expected)) {
        await noteFailure(request);
        return json({ error: 'Squadra o PIN non validi.' }, 401);
      }

      await clearFailures(request);
      const res = json({ team, state: await readState() });
      setSession(res, team);
      return res;
    }

    /* --- logout --- */
    if (action === 'logout') {
      const res = json({ ok: true });
      clearSession(res);
      return res;
    }

    /* --- scrittura: solo con sessione valida, solo sulla propria riga --- */
    const team = verify(request.cookies.get(COOKIE)?.value);
    if (!team) {
      return json({ error: 'Sessione scaduta. Inserisci di nuovo il PIN.' }, 401);
    }

    /* --- proposte di regolamento: nuova proposta --- */
    if (action === 'rule-add') {
      const { title, text, note } = (await request.json().catch(() => ({}))) || {};
      const t = String(title || '').trim();
      const x = String(text || '').trim();
      const n = String(note || '').trim();
      if (t.length < 3 || t.length > MAX_RULE_TITLE) {
        return json({ error: `Titolo: da 3 a ${MAX_RULE_TITLE} caratteri.` }, 400);
      }
      if (x.length < 10 || x.length > MAX_RULE_TEXT) {
        return json({ error: `Descrizione: da 10 a ${MAX_RULE_TEXT} caratteri.` }, 400);
      }
      if (n.length > MAX_RULE_NOTE) {
        return json({ error: `Nota: massimo ${MAX_RULE_NOTE} caratteri.` }, 400);
      }

      const state = await readState();
      if (state.regole.length >= MAX_RULES) {
        return json({ error: 'Troppe proposte aperte. Chiudetene qualcuna prima di aggiungerne altre.' }, 400);
      }
      if (state.regole.filter((r) => r.team === team).length >= MAX_RULES_PER_TEAM) {
        return json({ error: `Massimo ${MAX_RULES_PER_TEAM} proposte per squadra.` }, 400);
      }

      state.regole.push({
        id: crypto.randomUUID(),
        team,
        title: t,
        text: x,
        note: n,
        created: new Date().toISOString(),
        votes: {},
      });
      state.updated = new Date().toISOString();
      await writeState(state);
      return json({ team, state });
    }

    /* --- proposte di regolamento: voto (pollice su / giù, ri-cliccare annulla) --- */
    if (action === 'rule-vote') {
      const { id, vote } = (await request.json().catch(() => ({}))) || {};
      if (vote !== null && !RULE_VOTES.includes(vote)) {
        return json({ error: 'Voto non valido' }, 400);
      }
      const state = await readState();
      const rule = state.regole.find((r) => r.id === id);
      if (!rule) return json({ error: 'Proposta non trovata' }, 404);

      if (vote === null) delete rule.votes[team];
      else rule.votes[team] = vote;
      state.updated = new Date().toISOString();
      await writeState(state);
      return json({ team, state });
    }

    /* --- proposte di regolamento: cancellazione, solo della propria --- */
    if (action === 'rule-del') {
      const { id } = (await request.json().catch(() => ({}))) || {};
      const state = await readState();
      const rule = state.regole.find((r) => r.id === id);
      if (!rule) return json({ error: 'Proposta non trovata' }, 404);
      if (rule.team !== team) return json({ error: 'Puoi cancellare solo le tue proposte.' }, 403);

      state.regole = state.regole.filter((r) => r.id !== id);
      state.updated = new Date().toISOString();
      await writeState(state);
      return json({ team, state });
    }

    const body = await request.json().catch(() => ({}));
    const { field, value } = body || {};

    if (!Object.keys(ALLOWED).includes(field) && !FREE_TEXT.includes(field)) {
      return json({ error: 'Campo non valido' }, 400);
    }
    if (FREE_TEXT.includes(field)) {
      if (typeof value !== 'string' || value.length > MAX_TEXT) {
        return json({ error: `Testo non valido (max ${MAX_TEXT} caratteri).` }, 400);
      }
    } else if (value !== null && value !== '' && !ALLOWED[field].includes(value)) {
      return json({ error: 'Valore non valido' }, 400);
    }

    const state = await readState();
    if (value === null || value === '') delete state[field][team];
    else state[field][team] = value;
    // chi non vota più "altra" non lascia in giro la propria proposta
    if (field === 'loc' && value !== 'altra') delete state.locNote[team];
    state.updated = new Date().toISOString();
    await writeState(state);

    return json({ team, state });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
