'use client';

import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useMercato } from './MercatoProvider';
import { tradeStatus, formatDate } from '../../lib/mercato';
import Countdown from './Countdown';

/* Scambi proposti. Come nell'originale non c'è un'accettazione esplicita:
   la proposta resta in bacheca 24 ore e poi risulta conclusa. */
export default function TradeList() {
  const { mercato, me, cancella } = useMercato();
  const [tick, setTick] = useState(0);
  const reduce = useReducedMotion();

  const trades = useMemo(() => {
    const now = Date.now();
    return mercato.scambi
      .map((t) => ({ ...t, ...tradeStatus(t, now) }))
      .sort((a, b) => {
        if (a.closed !== b.closed) return a.closed ? 1 : -1;
        return b.endsAt - a.endsAt;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mercato.scambi, tick]);

  if (trades.length === 0) {
    return <p className="mk-empty">Nessuno scambio proposto al momento.</p>;
  }

  return (
    <div className="mk-list">
      {trades.map((t) => (
        <motion.article
          key={t.id}
          layout={!reduce}
          className={`mk-card${t.closed ? ' closed' : ''}${t.team === me ? ' mine' : ''}`}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mk-trade">
            <div className="mk-side">
              <span className="mk-team">{t.team}</span>
              <span className="mk-player">{t.giocatoreOfferto}</span>
              {t.creditiOfferti ? <span className="mk-credits plus">+{t.creditiOfferti} cr</span> : null}
            </div>

            <div className="mk-swap" aria-hidden="true">⇄</div>

            <div className="mk-side">
              <span className="mk-team">{t.ricevente}</span>
              <span className="mk-player">{t.giocatoreRichiesto}</span>
              {t.creditiRichiesti ? <span className="mk-credits minus">−{t.creditiRichiesti} cr</span> : null}
            </div>

            <div className="mk-card-state">
              {t.closed ? (
                <span className="mk-badge done">Concluso</span>
              ) : (
                <>
                  <span className="mk-label">Tempo rimasto</span>
                  <Countdown endsAt={t.endsAt} onEnd={() => setTick((x) => x + 1)} />
                </>
              )}
            </div>
          </div>

          <div className="mk-card-foot">
            <span className="mk-sub">Proposto {formatDate(t.data)}</span>
            {t.team === me && !t.closed && (
              <button type="button" className="mk-del" onClick={() => cancella('scambi', t.id)}>
                Ritira proposta
              </button>
            )}
          </div>
        </motion.article>
      ))}
    </div>
  );
}
