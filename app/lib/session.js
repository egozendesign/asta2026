// Sessione e storage condivisi fra le API route (/api/state e /api/mercato).
//
// Prima questa logica viveva tutta dentro app/api/state/route.js. È stata
// estratta qui quando è arrivato il mercato: due route che parlano con lo
// stesso Redis e riconoscono lo stesso cookie non devono avere due copie del
// codice crypto, altrimenti prima o poi divergono e una delle due diventa la
// più debole.
//
// Variabili d'ambiente richieste su Vercel:
//   KV_REST_API_URL     (dall'integrazione Upstash Redis)
//   KV_REST_API_TOKEN   (dall'integrazione Upstash Redis)
//   TEAM_PINS           JSON: {"Pandamonio":"1234", ...}
//   SESSION_SECRET      stringa random lunga (>= 32 caratteri)
//   ADMIN_PIN           (facoltativa) codice del backoffice /mercato/admin.
//                       Se manca, il pannello resta chiuso a chiunque.

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { TEAMS } from './constants';

const URL_BASE = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;
const SECRET = process.env.SESSION_SECRET || '';

export const COOKIE = 'asta_sess';
export const ADMIN_COOKIE = 'asta_admin';
export const MAX_TRIES = 8;          // tentativi PIN falliti consentiti
export const LOCK_WINDOW = 15 * 60;  // finestra di blocco, in secondi
export const SESSION_DAYS = 30;
// L'admin puo' riscrivere i dati di tutti: la sua sessione dura molto meno di
// quella di gioco, cosi' un dispositivo lasciato aperto non resta admin per un mese.
export const ADMIN_DAYS = 1;
export const ADMIN_PIN_MIN = 6;

/* ---------- storage ---------- */

// Un comando Redis per chiamata, nella forma array della REST API di Upstash:
// redis(['RPUSH', chiave, valore]).
export async function redis(cmd) {
  const res = await fetch(URL_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  return res.json();
}

/* ---------- PIN ---------- */

export function pins() {
  try {
    return JSON.parse(process.env.TEAM_PINS || '{}');
  } catch {
    return {};
  }
}

// confronto a tempo costante: non rivela quante cifre sono corrette
export function pinMatches(input, expected) {
  const a = Buffer.from(String(input));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a); // consuma comunque tempo
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function clientKey(request) {
  const fwd = request.headers.get('x-forwarded-for') || '';
  return crypto
    .createHash('sha256')
    .update(String(fwd).split(',')[0].trim() || 'unknown')
    .digest('hex')
    .slice(0, 16);
}

// `prefix` separa i contatori: i tentativi falliti sul PIN admin non devono
// bloccare il login di una squadra dietro lo stesso IP, e viceversa.
export async function tooManyTries(request, prefix = 'try') {
  const out = await redis(['GET', `asta2026:${prefix}:${clientKey(request)}`]);
  return Number(out.result || 0) >= MAX_TRIES;
}

export async function noteFailure(request, prefix = 'try') {
  const k = `asta2026:${prefix}:${clientKey(request)}`;
  await redis(['INCR', k]);
  await redis(['EXPIRE', k, String(LOCK_WINDOW)]);
}

export async function clearFailures(request, prefix = 'try') {
  await redis(['DEL', `asta2026:${prefix}:${clientKey(request)}`]);
}

/* ---------- sessione (cookie firmato HMAC) ---------- */

function sign(team, exp) {
  const payload = `${Buffer.from(team).toString('base64url')}.${exp}`;
  const mac = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

// Verifica firma e scadenza e restituisce il valore firmato, senza dire cosa
// significhi: a stabilirlo sono verify() e verifyAdmin() qui sotto.
function unsign(cookieValue) {
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
  return Buffer.from(b64, 'base64url').toString();
}

export function verify(cookieValue) {
  const value = unsign(cookieValue);
  return value && TEAMS.includes(value) ? value : null;
}

// La squadra loggata, o null. Unico punto da cui le route leggono l'identità.
export function currentTeam(request) {
  return verify(request.cookies.get(COOKIE)?.value);
}

function cookieOptions(maxAge) {
  return { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge };
}

export function setSession(res, team) {
  const exp = Date.now() + SESSION_DAYS * 86400 * 1000;
  res.cookies.set(COOKIE, sign(team, exp), cookieOptions(SESSION_DAYS * 86400));
}

export function clearSession(res) {
  res.cookies.set(COOKIE, '', cookieOptions(0));
}

/* ---------- sessione admin ---------- */

// Il payload firmato dell'admin non e' un nome di squadra, quindi un cookie di
// gioco non puo' valere come cookie di backoffice: cambierebbe il valore
// firmato, e senza SESSION_SECRET la firma non si rifa'.
const ADMIN_MARK = '__admin__';

// Tre stati distinti, non due: "manca" e "c'e' ma e' troppo corta" si
// risolvono in modi diversi, e un messaggio unico manda a cercare il problema
// nel posto sbagliato (tipicamente: si sospetta che la variabile non venga
// letta, quando invece il valore c'e' ed e' solo corto).
export function adminPinState() {
  const value = String(process.env.ADMIN_PIN || '');
  if (!value) return 'missing';
  if (value.length < ADMIN_PIN_MIN) return 'short';
  return 'ok';
}

export function adminPinConfigured() {
  return adminPinState() === 'ok';
}

export function adminPinMatches(input) {
  const expected = String(process.env.ADMIN_PIN || '');
  if (expected.length < ADMIN_PIN_MIN) return false;
  return pinMatches(String(input ?? ''), expected);
}

export function verifyAdmin(cookieValue) {
  return unsign(cookieValue) === ADMIN_MARK;
}

// True se la richiesta arriva da un backoffice autenticato.
export function isAdmin(request) {
  return verifyAdmin(request.cookies.get(ADMIN_COOKIE)?.value);
}

export function setAdminSession(res) {
  const exp = Date.now() + ADMIN_DAYS * 86400 * 1000;
  res.cookies.set(ADMIN_COOKIE, sign(ADMIN_MARK, exp), cookieOptions(ADMIN_DAYS * 86400));
}

export function clearAdminSession(res) {
  res.cookies.set(ADMIN_COOKIE, '', cookieOptions(0));
}

/* ---------- risposte ---------- */

export function json(body, status = 200) {
  const res = NextResponse.json(body, { status });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export function configError() {
  if (!URL_BASE || !TOKEN || !SECRET) {
    return json(
      { error: 'Configurazione incompleta: servono KV_REST_API_URL, KV_REST_API_TOKEN e SESSION_SECRET.' },
      500
    );
  }
  return null;
}
