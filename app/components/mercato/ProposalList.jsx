'use client';

import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useMercato } from './MercatoProvider';
import { ROLE_COLORS, formatDate } from '../../lib/mercato';

/* Giocatori messi a disposizione, raggruppati per squadra come nell'originale:
   a colpo d'occhio si vede chi ha roba da cedere e cosa cerca in cambio. */
export default function ProposalList() {
  const { mercato, me, cancella } = useMercato();
  const reduce = useReducedMotion();

  const groups = useMemo(() => {
    const byTeam = new Map();
    for (const p of mercato.proposti) {
      if (!byTeam.has(p.team)) byTeam.set(p.team, []);
      byTeam.get(p.team).push(p);
    }
    for (const list of byTeam.values()) {
      list.sort((a, b) => (Date.parse(b.data) || 0) - (Date.parse(a.data) || 0));
    }
    // La propria squadra sempre in cima, il resto in ordine alfabetico.
    return [...byTeam.entries()].sort(([a], [b]) => {
      if (a === me) return -1;
      if (b === me) return 1;
      return a.localeCompare(b, 'it');
    });
  }, [mercato.proposti, me]);

  if (groups.length === 0) {
    return <p className="mk-empty">Nessun giocatore proposto per ora.</p>;
  }

  return (
    <div className="mk-list">
      {groups.map(([team, players]) => (
        <motion.article
          key={team}
          layout={!reduce}
          className={`mk-card${team === me ? ' mine' : ''}`}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mk-card-head">
            <div className="mk-card-title">
              <h3>{team}</h3>
              <span className="mk-sub">
                {players.length} giocator{players.length === 1 ? 'e' : 'i'} a disposizione
              </span>
            </div>
          </div>

          <ul className="mk-players">
            {players.map((p) => (
              <li key={p.id}>
                <div className="mk-player-main">
                  <span className="mk-player">{p.nome}</span>
                  <span className="mk-sub">{formatDate(p.data)}</span>
                </div>
                <div className="mk-roles">
                  <span className="mk-label">cerca</span>
                  {p.ruoli.map((r) => (
                    <span
                      key={r}
                      className="mk-role"
                      style={{ '--role': ROLE_COLORS[r] || 'var(--muted)' }}
                    >
                      {r}
                    </span>
                  ))}
                </div>
                {p.team === me && (
                  <button type="button" className="mk-del" onClick={() => cancella('proposti', p.id)}>
                    Rimuovi
                  </button>
                )}
              </li>
            ))}
          </ul>
        </motion.article>
      ))}
    </div>
  );
}
