'use client';

import AnimatedSection from './AnimatedSection';
import ProposalVote from './ProposalVote';
import { TEAMS } from '../lib/constants';
import { useAsta } from './AstaProvider';

/* Proposta n.1 — è la più vecchia e resta scritta nel codice (i voti stanno nel
   campo `mercato`, da prima che esistessero le proposte libere). Da fuori è
   identica alle altre: stesso numero rosso, stesso proponente, stesso voto. */
export default function MarketProposal({ n }) {
  const { state, me, push } = useAsta();

  const votes = state.mercato || {};
  const mine = me ? { favorevole: 'up', contrario: 'down' }[votes[me]] || null : null;

  const vote = (v) => push('mercato', v === 'up' ? 'favorevole' : v === 'down' ? 'contrario' : null);

  return (
    <AnimatedSection className="rule">
      <h2><span className="num alt">{n}</span>Proposta: Riapertura mercato in sosta nazionali</h2>
      <div className="by">Proposta di <strong>Gli Admin</strong></div>
      <p>
        Negli anni passati avevamo sempre almeno una settimana tra l’asta e la prima giornata per fare
        scambi e comprare svincolati. Quest’anno, con l’asta di giovedì sera e la formazione da dare
        entro le <strong>20.45 di venerdì</strong>, quel tempo non c’è.
      </p>
      <p>
        <strong>La proposta è questa:</strong> poiché è prevista una{' '}
        <strong>lunga sosta per le nazionali</strong> dopo le prime 3 giornate di fantacalcio (tra la
        5ª e la 6ª di Serie A, <strong>20/09 → 10/10</strong>), in quella finestra si{' '}
        <strong>riapre il mercato</strong> — scambi tra squadre e acquisto svincolati per chi ha ancora
        budget — così tutti recuperano il tempo che quest’anno manca prima dell’asta.
      </p>
      <div className="note">
        <strong>Deroga proposta, valida solo per quest’anno:</strong> la regola attuale prevede che un
        giocatore non possa passare per più di 2 squadre. Con questa riapertura, i giocatori potrebbero
        essere scambiati fino a <strong>3 squadre</strong>.
      </div>
      <ProposalVote
        mine={mine}
        upVoters={TEAMS.filter((t) => votes[t] === 'favorevole')}
        downVoters={TEAMS.filter((t) => votes[t] === 'contrario')}
        onVote={vote}
      />
    </AnimatedSection>
  );
}
