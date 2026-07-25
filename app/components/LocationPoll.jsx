'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import AnimatedSection from './AnimatedSection';
import OptionCards from './OptionCards';
import ResultBars from './ResultBars';
import { TEAMS } from '../lib/constants';
import { useAsta } from './AstaProvider';

const MAX = 300;

const OPTIONS = [
  { key: 'teatro', title: '🎭 Teatro Spazio', desc: 'La location abituale, quella di sempre.' },
  { key: 'altra', title: '💡 Hai un’altra proposta?', desc: 'Vota qui e scrivi dove faresti l’asta: la proposta resta scritta qui sotto.' },
];

export default function LocationPoll() {
  const { state, me, push } = useAsta();
  const reduce = useReducedMotion();

  const mine = me ? state.loc?.[me] : null;
  const savedNote = (me && state.locNote?.[me]) || '';

  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);

  // se cambio voto lascio perdere la modifica in corso
  useEffect(() => {
    if (mine !== 'altra') setEditing(false);
  }, [mine]);

  const rows = [
    { key: 'teatro', label: '🎭 Teatro Spazio', voters: TEAMS.filter((t) => state.loc[t] === 'teatro') },
    { key: 'altra', label: '💡 Un’altra proposta', voters: TEAMS.filter((t) => state.loc[t] === 'altra') },
  ];

  // tutte le proposte scritte, mie e degli altri
  const proposals = TEAMS
    .map((team) => ({ team, text: (state.locNote?.[team] || '').trim() }))
    .filter((p) => p.text);

  // il form è aperto se ho votato "altra" e non ho ancora scritto, o se sto modificando
  const formOpen = mine === 'altra' && (!savedNote || editing);

  const onChange = (v) => {
    setDraft(v);
    if (!editing) setEditing(true);
  };

  const submit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    push('locNote', text.slice(0, MAX));
    setEditing(false);
  };

  const startEdit = () => {
    setDraft(savedNote);
    setEditing(true);
  };

  const cancel = () => {
    setDraft('');
    setEditing(false);
  };

  const remove = () => {
    push('locNote', '');
    setDraft('');
    setEditing(false);
  };

  const collapse = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, height: 0 },
        animate: { opacity: 1, height: 'auto' },
        exit: { opacity: 0, height: 0 },
        transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
      };

  return (
    <AnimatedSection>
      <h2><span className="num">1</span>Sondaggio Location</h2>
      <p>Dove facciamo l’asta?</p>
      <OptionCards options={OPTIONS} field="loc" />

      <AnimatePresence initial={false}>
        {formOpen && (
          <motion.div key="form" style={{ overflow: 'hidden' }} {...collapse}>
            <form className="proposal" onSubmit={submit}>
              <div className="ptitle">
                {savedNote ? 'Modifica la tua proposta' : 'Scrivi la tua proposta'}
              </div>
              <textarea
                value={draft}
                maxLength={MAX}
                placeholder="Dove faresti l’asta? Indirizzo, orari, perché va bene…"
                onChange={(e) => onChange(e.target.value)}
              />
              <div className="prow">
                <button type="submit" className="btn" disabled={!draft.trim()}>
                  {savedNote ? 'Salva modifica' : 'Invia proposta'}
                </button>
                {savedNote && (
                  <button type="button" className="btn ghost" onClick={cancel}>Annulla</button>
                )}
                <span className="pcount">{draft.length}/{MAX}</span>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <ResultBars rows={rows} />

      {proposals.length > 0 && (
        <div className="props">
          <div className="ptitle">Proposte arrivate</div>
          <AnimatePresence initial={false}>
            {proposals.map((p) => (
              <motion.div
                key={p.team}
                className={`prop${p.team === me ? ' mine' : ''}`}
                layout={!reduce}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ duration: reduce ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="who">{p.team}{p.team === me && ' — la tua proposta'}</div>
                <div className="txt">{p.text}</div>
                {p.team === me && !editing && (
                  <div className="prow">
                    <button type="button" className="btn" onClick={startEdit}>Modifica</button>
                    <button type="button" className="btn ghost" onClick={remove}>Cancella</button>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </AnimatedSection>
  );
}
