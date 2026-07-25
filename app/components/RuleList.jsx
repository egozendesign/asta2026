'use client';

import { AnimatePresence } from 'framer-motion';
import AnimatedSection from './AnimatedSection';
import ProposalVote from './ProposalVote';
import { TEAMS } from '../lib/constants';
import { useAsta } from './AstaProvider';

/* Le proposte scritte dalle squadre, una per box, numerate in ordine di arrivo
   a partire da `startAt` (la n.1 è quella fissa sul mercato).
   Ogni box è una AnimatedSection: entra scrollando come tutti gli altri. */
export default function RuleList({ startAt = 2 }) {
  const { state, me, voteRule, delRule } = useAsta();
  const rules = state.regole || [];

  return (
    <AnimatePresence initial={false}>
      {rules.map((r, i) => {
        const mine = me ? r.votes?.[me] || null : null;
        const voters = (v) => TEAMS.filter((t) => r.votes?.[t] === v);
        return (
          <AnimatedSection key={r.id} className="rule">
            <h2><span className="num alt">{startAt + i}</span>Proposta: {r.title}</h2>
            <div className="by">
              Proposta di <strong>{r.team}</strong>
              {r.team === me && <span className="you"> — la tua</span>}
            </div>
            <p className="rtext">{r.text}</p>
            {r.note && <div className="note">{r.note}</div>}
            <ProposalVote
              mine={mine}
              upVoters={voters('up')}
              downVoters={voters('down')}
              onVote={(v) => voteRule(r.id, v)}
            />
            {r.team === me && (
              <div className="prow">
                <button type="button" className="btn ghost" onClick={() => delRule(r.id)}>
                  Ritira la proposta
                </button>
              </div>
            )}
          </AnimatedSection>
        );
      })}
    </AnimatePresence>
  );
}
