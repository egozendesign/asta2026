'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { TEAMS } from '../../lib/constants';
import { ROLES, ROLE_COLORS, LIMITS } from '../../lib/mercato';
import { useMercato } from './MercatoProvider';

/* I tre form del mercato. Rispetto all'originale sparisce ovunque il campo
   "Squadra" e il campo "Password": la squadra è quella della sessione, quindi
   non si può più fare un'offerta a nome di un'altra. */

const PLACEHOLDER = 'Es. L.Martinez - Inter - Pc';

function Submit({ busy, children }) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="submit"
      className="btn mk-submit"
      disabled={busy}
      whileHover={reduce || busy ? {} : { scale: 1.02 }}
      whileTap={reduce || busy ? {} : { scale: 0.98 }}
      transition={{ duration: 0.15 }}
    >
      {busy ? 'Invio…' : children}
    </motion.button>
  );
}

// Messaggio "serve il PIN": ogni form lo mostra al posto dei campi.
function Locked({ what }) {
  return <p className="mk-locked">Inserisci il PIN della tua squadra qui sopra per {what}.</p>;
}

/* ---------- offerta per uno svincolato ---------- */

export function OffertaForm() {
  const { me, offri } = useMercato();
  const [nome, setNome] = useState('');
  const [offerta, setOfferta] = useState('');
  const [busy, setBusy] = useState(false);

  if (!me) return <Locked what="fare un'offerta" />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await offri(nome, offerta);
    if (ok) { setNome(''); setOfferta(''); }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="mk-form">
      <label className="flabel" htmlFor="sv-nome">Giocatore (cognome · squadra · ruolo)</label>
      <input
        id="sv-nome"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder={PLACEHOLDER}
        maxLength={LIMITS.nome}
        required
      />

      <label className="flabel" htmlFor="sv-off">Offerta (fantamilioni)</label>
      <input
        id="sv-off"
        type="number"
        inputMode="numeric"
        min={LIMITS.offertaMin}
        max={LIMITS.offertaMax}
        value={offerta}
        onChange={(e) => setOfferta(e.target.value)}
        placeholder="Es. 25"
        required
      />

      <Submit busy={busy}>Invia offerta</Submit>
      <p className="hint">Offri come <strong>{me}</strong>. La prima offerta apre l’asta e fa partire 24 ore.</p>
    </form>
  );
}

/* ---------- proposta di scambio ---------- */

export function ScambioForm() {
  const { me, proponiScambio } = useMercato();
  const [f, setF] = useState({
    ricevente: '', giocatoreOfferto: '', giocatoreRichiesto: '',
    creditiOfferti: '', creditiRichiesti: '',
  });
  const [busy, setBusy] = useState(false);

  if (!me) return <Locked what="proporre uno scambio" />;

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await proponiScambio(f);
    if (ok) {
      setF({ ricevente: '', giocatoreOfferto: '', giocatoreRichiesto: '', creditiOfferti: '', creditiRichiesti: '' });
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="mk-form">
      <label className="flabel" htmlFor="sc-ric">A quale squadra</label>
      <select id="sc-ric" value={f.ricevente} onChange={set('ricevente')} required>
        <option value="">— seleziona —</option>
        {TEAMS.filter((t) => t !== me).map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <label className="flabel" htmlFor="sc-off">Giocatore che offri</label>
      <input id="sc-off" value={f.giocatoreOfferto} onChange={set('giocatoreOfferto')}
             placeholder={PLACEHOLDER} maxLength={LIMITS.nome} required />

      <label className="flabel" htmlFor="sc-cro">Crediti che aggiungi <span className="opt-tag">(facoltativo)</span></label>
      <input id="sc-cro" type="number" inputMode="numeric" min="0" max={LIMITS.creditiMax}
             value={f.creditiOfferti} onChange={set('creditiOfferti')} placeholder="0" />

      <label className="flabel" htmlFor="sc-ric-g">Giocatore che chiedi</label>
      <input id="sc-ric-g" value={f.giocatoreRichiesto} onChange={set('giocatoreRichiesto')}
             placeholder={PLACEHOLDER} maxLength={LIMITS.nome} required />

      <label className="flabel" htmlFor="sc-crr">Crediti che chiedi <span className="opt-tag">(facoltativo)</span></label>
      <input id="sc-crr" type="number" inputMode="numeric" min="0" max={LIMITS.creditiMax}
             value={f.creditiRichiesti} onChange={set('creditiRichiesti')} placeholder="0" />

      <Submit busy={busy}>Proponi scambio</Submit>
      <p className="hint">Proponi come <strong>{me}</strong>. La proposta resta in bacheca 24 ore.</p>
    </form>
  );
}

/* ---------- giocatore messo a disposizione ---------- */

export function PropostaForm() {
  const { me, proponiGiocatore } = useMercato();
  const [nome, setNome] = useState('');
  const [ruoli, setRuoli] = useState([]);
  const [busy, setBusy] = useState(false);
  const reduce = useReducedMotion();

  if (!me) return <Locked what="proporre un giocatore" />;

  /* Selezione a chip invece delle tendine dell'originale: lì si sceglieva prima
     quanti ruoli e poi uno per tendina, e si potevano scegliere due volte gli
     stessi. Qui un ruolo già preso non è selezionabile due volte per costruzione. */
  const toggle = (r) => {
    setRuoli((prev) => {
      if (prev.includes(r)) return prev.filter((x) => x !== r);
      if (prev.length >= LIMITS.ruoliMax) return prev;
      return [...prev, r];
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await proponiGiocatore(nome, ruoli);
    if (ok) { setNome(''); setRuoli([]); }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="mk-form">
      <label className="flabel" htmlFor="pr-nome">Giocatore che offri</label>
      <input id="pr-nome" value={nome} onChange={(e) => setNome(e.target.value)}
             placeholder={PLACEHOLDER} maxLength={LIMITS.nome} required />

      <label className="flabel">Ruoli che cerchi in cambio <span className="opt-tag">(max {LIMITS.ruoliMax})</span></label>
      <div className="mk-role-picker" role="group" aria-label="Ruoli cercati">
        {ROLES.map((r) => {
          const on = ruoli.includes(r);
          const full = !on && ruoli.length >= LIMITS.ruoliMax;
          return (
            <motion.button
              key={r}
              type="button"
              className={`mk-role pick${on ? ' on' : ''}`}
              style={{ '--role': ROLE_COLORS[r] || 'var(--muted)' }}
              onClick={() => toggle(r)}
              disabled={full}
              aria-pressed={on}
              whileTap={reduce || full ? {} : { scale: 0.92 }}
              transition={{ duration: 0.12 }}
            >
              {r}
            </motion.button>
          );
        })}
      </div>

      <Submit busy={busy}>Proponi giocatore</Submit>
      <p className="hint">Proponi come <strong>{me}</strong>.</p>
    </form>
  );
}
