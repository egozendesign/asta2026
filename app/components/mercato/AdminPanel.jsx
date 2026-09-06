'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { TEAMS } from '../../lib/constants';
import { ROLES, ROLE_COLORS, LIMITS, formatDate, deriveAuctions } from '../../lib/mercato';
import { useMercato } from './MercatoProvider';

/* Backoffice del mercato: modifica e cancellazione di qualunque riga.

   Le tre liste hanno campi diversi, quindi invece di tre componenti quasi
   identici c'e' una descrizione dei campi (FIELDS) e un form che si costruisce
   da quella. Aggiungere un campo domani vuol dire aggiungere una riga li'. */

const LISTE = [
  { id: 'svincolati', label: 'Offerte svincolati' },
  { id: 'scambi', label: 'Scambi' },
  { id: 'proposti', label: 'Giocatori proposti' },
];

const FIELDS = {
  svincolati: [
    { k: 'team', label: 'Squadra', type: 'team' },
    { k: 'nome', label: 'Giocatore', type: 'text' },
    { k: 'offerta', label: 'Offerta', type: 'number', min: LIMITS.offertaMin, max: LIMITS.offertaMax },
  ],
  scambi: [
    { k: 'team', label: 'Propone', type: 'team' },
    { k: 'ricevente', label: 'Riceve', type: 'team' },
    { k: 'giocatoreOfferto', label: 'Giocatore offerto', type: 'text' },
    { k: 'creditiOfferti', label: 'Crediti offerti', type: 'number', min: 0, max: LIMITS.creditiMax },
    { k: 'giocatoreRichiesto', label: 'Giocatore richiesto', type: 'text' },
    { k: 'creditiRichiesti', label: 'Crediti richiesti', type: 'number', min: 0, max: LIMITS.creditiMax },
  ],
  proposti: [
    { k: 'team', label: 'Squadra', type: 'team' },
    { k: 'nome', label: 'Giocatore', type: 'text' },
    { k: 'ruoli', label: 'Ruoli cercati', type: 'roles' },
  ],
};

// Riassunto di una riga quando non e' in modifica.
function summary(lista, r) {
  if (lista === 'svincolati') return `${r.nome} — ${r.offerta} FM`;
  if (lista === 'scambi') {
    const off = r.creditiOfferti ? ` +${r.creditiOfferti}cr` : '';
    const ric = r.creditiRichiesti ? ` +${r.creditiRichiesti}cr` : '';
    return `${r.giocatoreOfferto}${off} ⇄ ${r.giocatoreRichiesto}${ric} (${r.ricevente})`;
  }
  return `${r.nome} — cerca ${(r.ruoli || []).join(', ')}`;
}

/* ---------- login ---------- */

function AdminLogin() {
  const { adminLogin, adminAvailable, status } = useMercato();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await adminLogin(pin);
    if (ok) setPin('');
    setBusy(false);
  };

  if (!adminAvailable) {
    return (
      <section>
        <h2 className="ptitle">Backoffice non configurato</h2>
        <p className="adm-note">
          Manca la variabile d’ambiente <code>ADMIN_PIN</code>. Finché non è impostata su Vercel
          (almeno 6 caratteri) il pannello resta chiuso a chiunque, compreso te.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="ptitle">Backoffice mercato</h2>
      <form onSubmit={submit} className="adm-login">
        <label className="flabel" htmlFor="adm-pin">Codice admin</label>
        <input
          id="adm-pin"
          type="password"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="••••••••"
        />
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Verifico…' : 'Entra'}</button>
        <span className={status.cls}>{status.msg}</span>
      </form>
      <p className="hint">
        È un codice a parte, diverso dai PIN delle squadre. Da qui si modificano e si cancellano
        le righe di tutti.
      </p>
    </section>
  );
}

/* ---------- riga in modifica ---------- */

function EditRow({ lista, record, onClose }) {
  const { adminEdit } = useMercato();
  const [draft, setDraft] = useState(() => {
    const d = {};
    for (const f of FIELDS[lista]) {
      d[f.k] = f.type === 'roles' ? [...(record[f.k] || [])] : (record[f.k] ?? '');
    }
    return d;
  });
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setDraft((p) => ({ ...p, [k]: v }));

  const toggleRole = (r) => {
    setDraft((p) => {
      const cur = p.ruoli || [];
      if (cur.includes(r)) return { ...p, ruoli: cur.filter((x) => x !== r) };
      if (cur.length >= LIMITS.ruoliMax) return p;
      return { ...p, ruoli: [...cur, r] };
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await adminEdit(lista, record.id, draft);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <form className="adm-edit" onSubmit={save}>
      <div className="adm-fields">
        {FIELDS[lista].map((f) => (
          <div key={f.k} className="adm-field">
            <label className="flabel" htmlFor={`${record.id}-${f.k}`}>{f.label}</label>

            {f.type === 'team' && (
              <select
                id={`${record.id}-${f.k}`}
                value={draft[f.k] ?? ''}
                onChange={(e) => set(f.k, e.target.value)}
              >
                {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}

            {f.type === 'text' && (
              <input
                id={`${record.id}-${f.k}`}
                value={draft[f.k] ?? ''}
                maxLength={LIMITS.nome}
                onChange={(e) => set(f.k, e.target.value)}
              />
            )}

            {f.type === 'number' && (
              <input
                id={`${record.id}-${f.k}`}
                type="number"
                inputMode="numeric"
                min={f.min}
                max={f.max}
                value={draft[f.k] ?? ''}
                onChange={(e) => set(f.k, e.target.value)}
              />
            )}

            {f.type === 'roles' && (
              <div className="mk-role-picker">
                {ROLES.map((r) => {
                  const on = (draft.ruoli || []).includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      className={`mk-role pick${on ? ' on' : ''}`}
                      style={{ '--role': ROLE_COLORS[r] || 'var(--muted)' }}
                      onClick={() => toggleRole(r)}
                      aria-pressed={on}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="adm-actions">
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Salvo…' : 'Salva'}</button>
        <button className="btn ghost" type="button" onClick={onClose}>Annulla</button>
      </div>
    </form>
  );
}

/* ---------- elenco di una lista ---------- */

function ListaAdmin({ lista }) {
  const { mercato, adminDel } = useMercato();
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const reduce = useReducedMotion();

  const records = [...mercato[lista]].sort(
    (a, b) => (Date.parse(b.data) || 0) - (Date.parse(a.data) || 0)
  );

  // Sulle offerte serve sapere a quale asta appartiene una riga: e' il motivo
  // per cui rinominare un giocatore tocca piu' righe insieme.
  const bidCount = new Map();
  if (lista === 'svincolati') {
    for (const a of deriveAuctions(mercato.svincolati)) bidCount.set(a.key, a.bids.length);
  }

  if (records.length === 0) return <p className="mk-empty">Nessuna riga in questa lista.</p>;

  return (
    <div className="adm-list">
      {records.map((r) => (
        <motion.div
          key={r.id}
          layout={!reduce}
          className="adm-row"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
        >
          <div className="adm-row-head">
            <div className="adm-row-main">
              <span className="adm-team">{r.team}</span>
              <span className="adm-summary">{summary(lista, r)}</span>
              <span className="mk-sub">{formatDate(r.data)}</span>
            </div>
            <div className="adm-row-btns">
              <button
                type="button"
                className="adm-btn"
                onClick={() => setEditing(editing === r.id ? null : r.id)}
              >
                {editing === r.id ? 'Chiudi' : 'Modifica'}
              </button>
              <button type="button" className="adm-btn danger" onClick={() => setConfirm(r.id)}>
                Elimina
              </button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {confirm === r.id && (
              <motion.div
                className="adm-confirm"
                initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                transition={{ duration: reduce ? 0 : 0.2 }}
              >
                <span>
                  Elimino <strong>{summary(lista, r)}</strong> di {r.team}? Non si torna indietro.
                </span>
                <div className="adm-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => { await adminDel(lista, r.id); setConfirm(null); }}
                  >
                    Sì, elimina
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setConfirm(null)}>
                    Annulla
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {editing === r.id && (
              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                transition={{ duration: reduce ? 0 : 0.25 }}
                style={{ overflow: 'hidden' }}
              >
                {lista === 'svincolati' && bidCount.get(playerKeyOf(r)) > 1 && (
                  <p className="adm-note">
                    Questa offerta fa parte di un’asta con {bidCount.get(playerKeyOf(r))} rilanci.
                    Se cambi il nome del giocatore, il nuovo nome viene applicato anche agli altri,
                    così l’asta non si spezza in due.
                  </p>
                )}
                <EditRow lista={lista} record={r} onClose={() => setEditing(null)} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
}

// stessa normalizzazione del server, per contare i rilanci dell'asta
function playerKeyOf(r) {
  return String(r?.nome ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/* ---------- pannello ---------- */

export default function AdminPanel() {
  const { admin, adminLogout, status, mercato } = useMercato();
  const [lista, setLista] = useState('svincolati');
  const reduce = useReducedMotion();

  if (!admin) return <AdminLogin />;

  const counts = {
    svincolati: mercato.svincolati.length,
    scambi: mercato.scambi.length,
    proposti: mercato.proposti.length,
  };

  return (
    <>
      <section className="adm-bar">
        <div className="arow">
          <span className="me-badge">✓ backoffice</span>
          <button className="btn ghost" onClick={adminLogout}>Esci dal backoffice</button>
          <span className={status.cls} style={{ marginLeft: 'auto' }}>{status.msg}</span>
        </div>
        <div className="hint">
          Qui modifichi e cancelli le righe di tutte le squadre. Le modifiche sono immediate e
          non c’è cronologia: quello che cancelli è perso.
        </div>
      </section>

      <div className="mk-tabs" role="tablist" aria-label="Liste del mercato">
        {LISTE.map((l) => (
          <button
            key={l.id}
            role="tab"
            aria-selected={lista === l.id}
            className={`mk-tab${lista === l.id ? ' on' : ''}`}
            onClick={() => setLista(l.id)}
          >
            <span>{l.label}</span>
            <b>{counts[l.id]}</b>
            {lista === l.id && (
              <motion.i
                className="mk-tab-ink"
                layoutId="adm-tab-ink"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={lista}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
        >
          <ListaAdmin lista={lista} />
        </motion.div>
      </AnimatePresence>
    </>
  );
}
