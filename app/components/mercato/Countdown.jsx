'use client';

import { useEffect, useState } from 'react';
import { formatTimeLeft } from '../../lib/mercato';

/* Cronometro delle 24 ore. Un solo intervallo per card, fermato appena arriva
   a zero: non serve continuare a ridisegnare un'asta già chiusa.

   Il primo render mostra un trattino e il valore vero arriva dall'effetto, così
   il markup non dipende da Date.now() al momento del render. */
export default function Countdown({ endsAt, onEnd }) {
  const [left, setLeft] = useState(null);

  useEffect(() => {
    const tick = () => {
      const ms = endsAt - Date.now();
      setLeft(ms);
      if (ms <= 0) {
        clearInterval(id);
        onEnd?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt, onEnd]);

  return (
    <span className="mk-timer" aria-live="off">
      {left === null ? '—' : formatTimeLeft(left)}
    </span>
  );
}
