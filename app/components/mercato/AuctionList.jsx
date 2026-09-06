'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useMercato } from './MercatoProvider';
import { deriveAuctions, formatDate } from '../../lib/mercato';
import Countdown from './Countdown';

/* Le aste non sono righe salvate: si ricostruiscono dalle offerte a ogni
   render (vedi deriveAuctions). `tick` esiste solo per rifare il calcolo
   quando un cronometro arriva a zero, così la card passa da aperta a chiusa
   senza aspettare il polling. */
export default function AuctionList() {
  const { mercato, me, cancella } = useMercato();
  const [open, setOpen] = useState(() => new Set());
  const [tick, setTick] = useState(0);
  const reduce = useReducedMotion();

  const auctions = useMemo(
    () => deriveAuctions(mercato.svincolati, Date.now()),
    // tick forza il ricalcolo alla scadenza di un'asta
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mercato.svincolati, tick]
  );

  const toggle = (key) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (auctions.length === 0) {
    return <p className="mk-empty">Nessuna offerta ancora. La prima apre l’asta e fa partire le 24 ore.</p>;
  }

  return (
    <div className="mk-list">
      {auctions.map((a) => {
        const isOpen = open.has(a.key);
        const mine = a.leadingTeam === me;

        return (
          <motion.article
            key={a.key}
            layout={!reduce}
            className={`mk-card${a.closed ? ' closed' : ''}${mine ? ' mine' : ''}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mk-card-head">
              <div className="mk-card-title">
                <h3>{a.displayName}</h3>
                <span className="mk-sub">
                  {a.bids.length} offert{a.bids.length === 1 ? 'a' : 'e'} · apertura {formatDate(new Date(a.firstBidAt).toISOString())}
                </span>
              </div>

              <div className="mk-card-figure">
                <span className="mk-amount">{a.highestBid}<i>FM</i></span>
                <span className={`mk-leader${mine ? ' me' : ''}`}>{a.leadingTeam}</span>
              </div>

              <div className="mk-card-state">
                {a.closed ? (
                  <span className="mk-badge done">Aggiudicato</span>
                ) : (
                  <>
                    <span className="mk-label">Tempo rimasto</span>
                    <Countdown endsAt={a.endsAt} onEnd={() => setTick((t) => t + 1)} />
                  </>
                )}
              </div>
            </div>

            <button
              type="button"
              className="mk-toggle"
              onClick={() => toggle(a.key)}
              aria-expanded={isOpen}
            >
              {isOpen ? 'Nascondi rilanci' : `Mostra tutti i rilanci (${a.bids.length})`}
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.ul
                  className="mk-bids"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ duration: reduce ? 0 : 0.25, ease: [0.16, 1, 0.3, 1] }}
                >
                  {[...a.bids].reverse().map((b) => (
                    <li key={b.id} className={b.team === a.leadingTeam && b.offer === a.highestBid ? 'top' : ''}>
                      <span className="mk-bid-team">{b.team}</span>
                      <span className="mk-bid-offer">{b.offer} FM</span>
                      <span className="mk-bid-date">{formatDate(new Date(b.ts).toISOString())}</span>
                      {b.team === me && !a.closed && (
                        <button
                          type="button"
                          className="mk-del"
                          onClick={() => cancella('svincolati', b.id)}
                          title="Ritira questa offerta"
                        >
                          Ritira
                        </button>
                      )}
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </motion.article>
        );
      })}
    </div>
  );
}
