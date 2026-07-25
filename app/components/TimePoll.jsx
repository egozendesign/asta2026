'use client';

import AnimatedSection from './AnimatedSection';
import { TEAMS } from '../lib/constants';
import { useAsta } from './AstaProvider';

export default function TimePoll() {
  const { state, me, push } = useAsta();

  const a = TEAMS.filter((t) => state.orari[t] === '19').length;
  const b = TEAMS.filter((t) => state.orari[t] === '20').length;

  return (
    <AnimatedSection>
      <h2><span className="num">2</span>Sondaggio Orario di Inizio</h2>
      <div className="note bad">
        <strong>Servono tra le 6 e le 7 ore</strong> per completare l’asta. Inizio 19 → fine indicativa
        1-2. Inizio 20 → fine indicativa 2-3.
      </div>
      <p>
        Una riga per squadra: basta che risponda <strong>almeno un componente</strong> per squadra (nel
        caso di squadre in coppia).
      </p>
      <div className="note info">
        Questo è un <strong>sondaggio informativo, non decisionale</strong>: non si decide a maggioranza.
        Ci sono squadre con un solo componente — se anche <strong>una sola</strong> squadra singola non
        può alle 19, si inizia alle 20.
      </div>
      <table>
        <thead>
          <tr><th>Squadra</th><th style={{ width: 200 }}>Orario</th></tr>
        </thead>
        <tbody>
          {TEAMS.map((t) => {
            const mine = t === me;
            const val = state.orari[t];
            return (
              <tr key={t} className={mine ? 'me' : ''}>
                <td className="team">{t}{mine && <span className="you"> ← tu</span>}</td>
                <td>
                  <div className="choice">
                    {['19', '20'].map((v) => (
                      <button
                        key={v}
                        className={val === v ? 'on' : ''}
                        disabled={!mine}
                        onClick={() => push('orari', val === v ? null : v)}
                      >
                        {v}:00
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="tally">
        Preferenza 19:00 → <b>{a}</b> · Preferenza 20:00 → <b>{b}</b> · Non ancora risposto:{' '}
        <b>{10 - a - b}</b>
      </div>
    </AnimatedSection>
  );
}
