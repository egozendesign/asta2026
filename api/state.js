// API condivisa con autenticazione PIN per squadra.
//
// Variabili d'ambiente richieste su Vercel:
//   KV_REST_API_URL     (dall'integrazione Upstash Redis)
//   KV_REST_API_TOKEN   (dall'integrazione Upstash Redis)
//   TEAM_PINS           JSON: {"Pandamonio":"1234", ...}
//   SESSION_SECRET      stringa random lunga (>= 32 caratteri)

import crypto from 'crypto';

const URL_BASE = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;
const SECRET = process.env.SESSION_SECRET || '';
const KEY = 'asta2026:state';

const TEAMS = [
  'Pandamonio',
  'Minturno Scauri',
  'Bestie Di Satana',
  'Spaccio Uno',
  'Diavolone Luis',
  'Dr.Gonzo Social Club',
  'S. Masterella',
  'Atletico Califfo',
  'Real Spillo',
  'Chivas Tramuort',
];

const MAX_TRIES = 8;          // tentativi PIN falliti consentiti
const LOCK_WINDOW = 15 * 60;  // finestra di blocco, in secondi
const SESSION_DAYS = 30;

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
  return { loc: {}, orari: {}, nec: {}, necNote: {}, updated: null };
}

async function readState() {
  const out = await redis(['GET', KEY]);
  if (!out.result) return emptyState();
  try {
    return { ...emptyState(), ...JSON.parse(out.result) };
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

function clientKey(req) {
  const fwd = req.headers['x-forwarded-for'] || '';
  return crypto
    .createHash('sha256')
    .update(String(fwd).split(',')[0].trim() || 'unknown')
    .digest('hex')
    .slice(0, 16);
}

async function tooManyTries(req) {
  const out = await redis(['GET', `asta2026:try:${clientKey(req)}`]);
  return Number(out.result || 0) >= MAX_TRIES;
}

async function noteFailure(req) {
  const k = `asta2026:try:${clientKey(req)}`;
  await redis(['INCR', k]);
  await redis(['EXPIRE', k, String(LOCK_WINDOW)]);
}

async function clearFailures(req) {
  await redis(['DEL', `asta2026:try:${clientKey(req)}`]);
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

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function setSession(res, team) {
  const exp = Date.now() + SESSION_DAYS * 86400 * 1000;
  res.setHeader(
    'Set-Cookie',
    `asta_sess=${sign(team, exp)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${
      SESSION_DAYS * 86400
    }`
  );
}

function clearSession(res) {
  res.setHeader('Set-Cookie', 'asta_sess=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
}

/* ---------- handler ---------- */

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!URL_BASE || !TOKEN || !SECRET) {
    return res.status(500).json({
      error:
        'Configurazione incompleta: servono KV_REST_API_URL, KV_REST_API_TOKEN e SESSION_SECRET.',
    });
  }

  const action = (req.query && req.query.action) || '';

  try {
    /* --- login --- */
    if (req.method === 'POST' && action === 'login') {
      if (await tooManyTries(req)) {
        return res
          .status(429)
          .json({ error: 'Troppi tentativi falliti. Riprova tra 15 minuti.' });
      }
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const { team, pin } = body;

      if (!TEAMS.includes(team) || !/^\d{4}$/.test(String(pin || ''))) {
        await noteFailure(req);
        return res.status(401).json({ error: 'Squadra o PIN non validi.' });
      }
      const expected = pins()[team];
      if (!expected || !pinMatches(pin, expected)) {
        await noteFailure(req);
        return res.status(401).json({ error: 'Squadra o PIN non validi.' });
      }

      await clearFailures(req);
      setSession(res, team);
      return res.status(200).json({ team, state: await readState() });
    }

    /* --- logout --- */
    if (req.method === 'POST' && action === 'logout') {
      clearSession(res);
      return res.status(200).json({ ok: true });
    }

    /* --- lettura: pubblica, chi ha il link vede i risultati --- */
    if (req.method === 'GET') {
      const team = verify(readCookie(req, 'asta_sess'));
      return res.status(200).json({ team, state: await readState() });
    }

    /* --- scrittura: solo con sessione valida, solo sulla propria riga --- */
    if (req.method === 'POST') {
      const team = verify(readCookie(req, 'asta_sess'));
      if (!team) {
        return res.status(401).json({ error: 'Sessione scaduta. Inserisci di nuovo il PIN.' });
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const { field, value } = body;

      if (!['loc', 'orari', 'nec', 'necNote'].includes(field)) {
        return res.status(400).json({ error: 'Campo non valido' });
      }
      const allowed = { loc: ['teatro', 'cesano'], orari: ['19', '20'], nec: ['si', 'no'] };
      if (field === 'necNote') {
        if (typeof value !== 'string' || value.length > 300) {
          return res.status(400).json({ error: 'Nota non valida (max 300 caratteri).' });
        }
      } else if (value !== null && !allowed[field].includes(value)) {
        return res.status(400).json({ error: 'Valore non valido' });
      }

      const state = await readState();
      if (value === null || value === '') delete state[field][team];
      else state[field][team] = value;
      state.updated = new Date().toISOString();
      await writeState(state);

      return res.status(200).json({ team, state });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Metodo non consentito' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
