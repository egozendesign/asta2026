'use client';

import { useEffect, useRef, useState } from 'react';
import AnimatedSection from './AnimatedSection';
import { TEAMS } from '../lib/constants';
import { useAsta } from './AstaProvider';

/* Box 3 — nasce dall'unione del vecchio "Orario di chiusura" (solo testo, da solo
   non stava in piedi) e di "Necessità reali di chiudere alle 2": prima si illustra
   la situazione, poi si segnala subito la propria posizione. */

const MAX = 300;

export default function ClosingTime() {
  const { state, me, push, notify } = useAsta();

  // Nota della mia squadra: bozza locale + salvataggio con ritardo (debounce),
  // così non si salva a ogni tasto. Si sincronizza col server solo se non sto scrivendo.
  const [noteDraft, setNoteDraft] = useState('');
  const focusedRef = useRef(false);
  const timerRef = useRef(null);
  const serverNote = me ? state.necNote[me] || '' : '';
  const mineVal = me ? state.nec[me] || '' : '';

  useEffect(() => {
    if (!focusedRef.current) setNoteDraft(serverNote);
  }, [serverNote, me]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const onNoteChange = (v) => {
    setNoteDraft(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => push('necNote', v), 700);
  };

  const pick = (v) => {
    if (!me) { notify('Inserisci il PIN per segnalare', 'err'); return; }
    push('nec', mineVal === v ? null : v);
  };

  return (
    <AnimatedSection>
      <h2><span className="num">3</span>Orario di Chiusura</h2>
      <p>
        Una volta fissato l’inizio si definisce la fine, che sarà <strong>tra le 2 e le 3 di notte</strong>.
        L’impegno di tutti è chiudere <strong>non oltre le 2</strong>, ma si chiede a tutti flessibilità
        vista la situazione di necessità che si è venuta a creare.
      </p>
      <ul className="timeline">
        <li>Inizio ore <strong>19</strong> o <strong>20</strong> (da definire col sondaggio 2)</li>
        <li>Durata piena stimata: <strong>6-7 ore</strong></li>
        <li>Chiusura target: <strong>ore 2</strong> — tolleranza massima ore 3</li>
      </ul>

      <p style={{ marginTop: 18 }}>
        Se la tua squadra ha una <strong>necessità REALE</strong> di chiudere alle 2 e non
        oltre, puoi segnalare la motivazione.
      </p>
      <div className="note info">
        Le <strong>squadre singole</strong> hanno più potere decisionale. Per le squadre in coppia la
        necessità vale solo se <strong>entrambi</strong> i componenti non possono andare oltre le 2.
      </div>

      <div className="proposal">
        <div className="ptitle">Indica la disponibilità della Squadra</div>
        <div className="choice">
          <button type="button" className={mineVal === 'no' ? 'on' : ''} onClick={() => pick('no')}>
            Flessibile
          </button>
          <button type="button" className={mineVal === 'si' ? 'on' : ''} onClick={() => pick('si')}>
            ⚠️ Tassativo — chiusura alle 2
          </button>
        </div>
        <textarea
          style={{ marginTop: 10 }}
          maxLength={MAX}
          disabled={!me}
          placeholder={me ? 'Motivo / note — es. lavoro alle 7, turno, ecc.' : 'Inserisci il PIN per segnalare'}
          value={noteDraft}
          onFocus={() => { focusedRef.current = true; }}
          onBlur={() => { focusedRef.current = false; }}
          onChange={(e) => onNoteChange(e.target.value)}
        />
        <div className="prow">
          <span className="hint" style={{ margin: 0 }}>
            {me ? 'Si salva da solo mentre scrivi.' : 'Puoi leggere tutto, ma per segnalare serve il PIN.'}
          </span>
          <span className="pcount">{noteDraft.length}/{MAX}</span>
        </div>
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
                <td>
                  <span className="ro">
                    {val === 'si' ? '⚠️ Sì, chiusura alle 2' : val === 'no' ? 'Flessibile' : '—'}
                  </span>
                </td>
                <td><span className="ro">{note || '—'}</span></td>
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
        tutti gli altri, saranno comunque <strong>soggetti ad asta completa</strong> con i soliti tempi tecnici.
      </div>
    </AnimatedSection>
  );
}
