'use client';

import { Fragment } from 'react';

/* Barre + conteggi + elenco votanti. Riusato da Location e proposte.
   rows: [{ key, label, voters: string[], tone?: 'neg' }]
   `tone: 'neg'` colora barra e votanti di rosso (i voti contrari).
   La larghezza barra è animata via CSS (.bar>i { transition: width }). */
export default function ResultBars({ rows }) {
  const total = Math.max(rows.reduce((s, r) => s + r.voters.length, 0), 1);
  return (
    <>
      {rows.map((r) => (
        <Fragment key={r.key}>
          <div className="cnt">
            <span>{r.label}</span>
            <span>{r.voters.length} {r.voters.length === 1 ? 'voto' : 'voti'}</span>
          </div>
          <div className={`bar${r.tone === 'neg' ? ' neg' : ''}`}>
            <i style={{ width: `${(r.voters.length / total) * 100}%` }} />
          </div>
          <div className={`voters${r.tone === 'neg' ? ' neg' : ''}`}>{r.voters.join(' · ')}</div>
        </Fragment>
      ))}
    </>
  );
}
