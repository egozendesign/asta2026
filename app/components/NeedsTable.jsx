'use client';

import { useEffect, useRef, useState } from 'react';
import AnimatedSection from './AnimatedSection';
import { TEAMS } from '../lib/constants';
import { useAsta } from './AstaProvider';

export default function NeedsTable({ index }) {
  const { state, me, push } = useAsta();

  // Nota della mia squadra: bozza locale + salvataggio con ritardo (debounce),
  // così non si salva a ogni tasto. Si sincronizza col server solo se non sto scrivendo.
  const [noteDraft, setNoteDraft] = useState('');
  const focusedRef = useRef(false);
  const timerRef = useRef(null);
  const serverNote = me ? (state.necNote[me] || '') : '';

  useEffect(() => {
    if (!focusedRef.current) setNoteDraft(serverNote);
  }, [serverNote, me]);

  const onNoteChange = (v) => {
    setNoteDraft(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => push('necNote', v), 700);
  };

  return (
    <AnimatedSection index={index}>
      <h2><span className="num">4</span>Necessità reali di chiudere alle 2</h2>
      <p>
        Segnala qui se la tua squadra ha una <strong>necessità REALE</strong> di chiudere alle 2 e non
        oltre (lavoro il giorno dopo o altri impegni seri).
      </p>
      <div className="note info">
        Le <strong>squadre singole</strong> hanno più potere decisionale. Per le squadre in coppia la
        necessità vale solo se <strong>entrambi</strong> i componenti non possono andare oltre le 2.
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: '28%' }}>Squadra</th>
            <th style={{ width: '24%' }}>Necessità</th>
            <th>Motivo / note</th>
          </tr>
        </thead>
        <tbody>
          {TEAMS.map((t) => {
            const mine = t === me;
            const val = state.nec[t] || '';
            const note = state.necNote[t] || '';
            return (
              <tr key={t} className={mine ? 'me' : ''}>
                <td className="team">{t}{mine && <span className="you"> ← tu</span>}</td>
                {mine ? (
                  <>
                    <td>
                      <select value={val} onChange={(e) => push('nec', e.target.value)}>
                        <option value="">—</option>
                        <option value="no">No, flessibile</option>
                        <option value="si">Sì, chiusura alle 2</option>
                      </select>
                    </td>
                    <td>
                      <textarea
                        maxLength={300}
                        placeholder="es. lavoro alle 7, turno, ecc."
                        value={noteDraft}
                        onFocus={() => { focusedRef.current = true; }}
                        onBlur={() => { focusedRef.current = false; }}
                        onChange={(e) => onNoteChange(e.target.value)}
                      />
                    </td>
                  </>
                ) : (
                  <>
                    <td>
                      <span className="ro">
                        {val === 'si' ? '⚠️ Sì, chiusura alle 2' : val === 'no' ? 'Flessibile' : '—'}
                      </span>
                    </td>
                    <td><span className="ro">{note || '—'}</span></td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="note" style={{ marginTop: 16 }}>
        <strong>Regola sui buchi in rosa:</strong> se all’orario di chiusura stabilito (le 2, o quello
        concordato) qualcuno che deve necessariamente andare via ha ancora <strong>buchi in rosa</strong>,{' '}
        <em>solo in quel caso</em> e <em>solo per le squadre che lo hanno segnalato qui in anticipo</em>,
        si potranno chiamare giocatori non ancora usciti per completare la rosa. Questi giocatori, come
        tutti gli altri, saranno comunque <strong>soggetti ad asta completa</strong>.
      </div>
    </AnimatedSection>
  );
}
