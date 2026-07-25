'use client';

import { useAsta } from './AstaProvider';

/* Griglia di card selezionabili (Location, Mercato).
   options: [{ key, title, desc }]
   field: nome campo da salvare ('loc' | 'mercato')
   Clic senza login → avviso; clic sulla scelta già attiva → deseleziona. */
export default function OptionCards({ options, field }) {
  const { state, me, push, notify } = useAsta();
  const mine = me ? state[field]?.[me] : null;

  const pick = (key) => {
    if (!me) { notify('Inserisci il PIN per votare', 'err'); return; }
    push(field, mine === key ? null : key);
  };

  return (
    <div className="opts">
      {options.map((o) => (
        <div
          key={o.key}
          className={`opt${mine === o.key ? ' sel' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => pick(o.key)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(o.key); } }}
        >
          <div className="t">{o.title}</div>
          <div className="d">{o.desc}</div>
        </div>
      ))}
    </div>
  );
}
