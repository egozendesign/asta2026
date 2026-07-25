'use client';

import ResultBars from './ResultBars';
import { useAsta } from './AstaProvider';

/* Voto pollice su / giù, condiviso da tutte le proposte di regolamento
   (compresa la n.1, che sotto sotto scrive ancora nel campo `mercato`).

   mine: 'up' | 'down' | null — la mia posizione attuale
   onVote(v): v è 'up' | 'down' | null; ri-cliccare la scelta attiva annulla il voto */
export default function ProposalVote({ mine, upVoters, downVoters, onVote }) {
  const { me, notify } = useAsta();

  const click = (v) => {
    if (!me) { notify('Inserisci il PIN per votare', 'err'); return; }
    onVote(mine === v ? null : v);
  };

  const rows = [
    { key: 'up', label: '👍 Favorevole', voters: upVoters },
    { key: 'down', label: '👎 Contrario', voters: downVoters, tone: 'neg' },
  ];

  return (
    <div className="vote">
      <div className="choice">
        <button type="button" className={`thumb${mine === 'up' ? ' on' : ''}`} onClick={() => click('up')}>
          👍 <span>Favorevole</span> <b>{upVoters.length}</b>
        </button>
        <button type="button" className={`thumb down${mine === 'down' ? ' on' : ''}`} onClick={() => click('down')}>
          👎 <span>Contrario</span> <b>{downVoters.length}</b>
        </button>
      </div>
      <ResultBars rows={rows} />
    </div>
  );
}
