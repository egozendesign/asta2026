// Logica del mercato condivisa fra API route e componenti client.
//
// Portata da new-mercato (app statica su Airtable). Il modello dati è rimasto
// quello originale, che è la ragione per cui Redis basta: il mercato è
// append-only. Un'asta non è una riga che si aggiorna, è la somma delle offerte
// ricevute per quel giocatore — deriveAuctions() la ricostruisce a ogni lettura,
// esattamente come faceva processAuctions() nell'originale. Due squadre che
// rilanciano nello stesso istante accodano due eventi distinti con RPUSH
// (atomico), quindi non esiste il caso "l'ultima scrittura cancella la prima".

export const AUCTION_DURATION_MS = 24 * 60 * 60 * 1000;

// Ruoli del Mantra. L'ordine è quello del listone, non alfabetico.
export const ROLES = ['P', 'Dc', 'Dd', 'Ds', 'B', 'E', 'M', 'C', 'W', 'T', 'A', 'PC'];

// Colore per reparto, agganciato ai token di globals.css dove ha senso.
export const ROLE_COLORS = {
  P: '#E0B341',
  Dc: '#3FA45B', Dd: '#3FA45B', Ds: '#3FA45B', B: '#3FA45B',
  E: '#4A8FD4', M: '#4A8FD4', C: '#4A8FD4',
  W: '#9B6FD0', T: '#9B6FD0',
  A: '#D45A5A', PC: '#D45A5A',
};

export const LIMITS = {
  nome: 80,       // "L.Martinez - Inter - Pc"
  offertaMin: 1,
  offertaMax: 1000,
  creditiMax: 1000,
  ruoliMax: 3,
  recordsMax: 500, // tetto per lista, evita che Redis cresca all'infinito
};

/* ---------- validazione, usata lato server e per il feedback nei form ---------- */

export function cleanName(v) {
  return String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, LIMITS.nome);
}

// Ritorna una stringa d'errore, oppure null se il nome va bene.
export function validateName(v) {
  const n = cleanName(v);
  if (n.length < 3) return 'Il nome del giocatore è troppo corto.';
  return null;
}

// Le offerte arrivano da un input number: qui si accetta solo un intero nel range.
export function parseOffer(v) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < LIMITS.offertaMin || n > LIMITS.offertaMax) return null;
  return n;
}

// I crediti sono facoltativi negli scambi: '' e null valgono "nessun credito".
export function parseCredits(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0 || n > LIMITS.creditiMax) return null;
  return n;
}

export function validateRoles(list) {
  const arr = Array.isArray(list) ? list.filter(Boolean) : [];
  if (arr.length === 0) return 'Seleziona almeno un ruolo.';
  if (arr.length > LIMITS.ruoliMax) return `Massimo ${LIMITS.ruoliMax} ruoli.`;
  if (arr.some((r) => !ROLES.includes(r))) return 'Ruolo non valido.';
  if (new Set(arr).size !== arr.length) return 'Non puoi selezionare lo stesso ruolo due volte.';
  return null;
}

/* ---------- derivazione delle aste ---------- */

// Chiave di raggruppamento: lo stesso giocatore scritto con maiuscole o spazi
// diversi deve finire nella stessa asta, altrimenti si creano aste parallele.
export function playerKey(nome) {
  return cleanName(nome).toLowerCase();
}

/* Un'asta chiusa non è ancora finita: chi ha vinto ha 6 ore per dire chi
   svincola, o per dire che non deve svincolare nessuno. Se non lo fa, l'asta
   si annulla e il giocatore torna disponibile.

   Le quattro fasi:
     aperta    — si rilancia, non sono passate 24h dalla prima offerta
     attesa    — chiusa, il vincitore ha ancora tempo per lo svincolo
     conclusa  — svincolo dichiarato: il giocatore è suo
     annullata — le 6 ore sono passate a vuoto, il giocatore torna in lista */
export const SVINCOLO_WINDOW_MS = 6 * 60 * 60 * 1000;

// records: lista piatta di offerte { id, team, nome, offerta, data }.
// svincoli: lista piatta di dichiarazioni { team, asta, nome, nessuno }.
// Ritorna le aste ordinate: prima quelle aperte (scadenza più vicina in cima),
// poi quelle in attesa di svincolo, infine quelle finite (più recenti in cima).
export function deriveAuctions(records, now = Date.now(), svincoli = []) {
  const byPlayer = new Map();

  for (const r of records) {
    const key = playerKey(r?.nome);
    if (!key) continue;
    const offerta = Number.parseInt(r.offerta, 10);
    if (!Number.isFinite(offerta)) continue;

    if (!byPlayer.has(key)) {
      byPlayer.set(key, { key, displayName: cleanName(r.nome), bids: [] });
    }
    byPlayer.get(key).bids.push({
      id: r.id,
      team: r.team,
      offer: offerta,
      ts: Date.parse(r.data) || 0,
    });
  }

  const auctions = [];
  for (const a of byPlayer.values()) {
    a.bids.sort((x, y) => x.ts - y.ts);

    // La prima offerta fa partire il cronometro delle 24 ore: i rilanci
    // successivi non lo riavviano (comportamento dell'app originale).
    const firstTs = a.bids[0].ts;
    const endsAt = firstTs + AUCTION_DURATION_MS;
    const svincoloEndsAt = endsAt + SVINCOLO_WINDOW_MS;

    // A parità di importo vince chi ha offerto per primo, perché scorriamo in
    // ordine cronologico e sostituiamo solo su offerta strettamente maggiore.
    let highest = -1;
    let leader = null;
    for (const b of a.bids) {
      if (b.offer > highest) {
        highest = b.offer;
        leader = b.team;
      }
    }

    const svincolo = leader
      ? svincoli.find((r) => r?.asta === a.key && r?.team === leader) || null
      : null;

    const closed = endsAt <= now;
    let phase = 'aperta';
    if (closed) phase = svincolo ? 'conclusa' : now < svincoloEndsAt ? 'attesa' : 'annullata';

    auctions.push({
      key: a.key,
      displayName: a.displayName,
      bids: a.bids,
      highestBid: highest,
      leadingTeam: leader,
      firstBidAt: firstTs,
      lastBidAt: a.bids[a.bids.length - 1].ts,
      endsAt,
      svincoloEndsAt,
      svincolo,
      phase,
      closed,
    });
  }

  const rango = { aperta: 0, attesa: 1, conclusa: 2, annullata: 2 };
  auctions.sort((x, y) => {
    if (rango[x.phase] !== rango[y.phase]) return rango[x.phase] - rango[y.phase];
    if (x.phase === 'aperta') return x.endsAt - y.endsAt;
    if (x.phase === 'attesa') return x.svincoloEndsAt - y.svincoloEndsAt;
    return y.endsAt - x.endsAt;
  });
  return auctions;
}

// Uno scambio resta "in attesa" per 24 ore dalla proposta, poi è considerato
// concluso. Nessuna accettazione esplicita: è così anche nell'app originale.
export function tradeStatus(t, now = Date.now()) {
  const endsAt = (Date.parse(t?.data) || 0) + AUCTION_DURATION_MS;
  return { endsAt, closed: endsAt <= now };
}

/* ---------- formattazione ---------- */

export function formatTimeLeft(ms) {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function formatDate(value) {
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
