'use client';

import AnimatedSection from './AnimatedSection';
import OptionCards from './OptionCards';
import ResultBars from './ResultBars';
import { TEAMS } from '../lib/constants';
import { useAsta } from './AstaProvider';

const OPTIONS = [
  { key: 'favorevole', title: '👍 Favorevole', desc: 'Riapriamo il mercato durante la sosta, con la deroga alle 3 squadre.' },
  { key: 'contrario', title: '👎 Non favorevole', desc: 'Lasciamo le regole di sempre, niente riapertura.' },
];

export default function MarketProposal() {
  const { state } = useAsta();
  const rows = [
    { key: 'favorevole', label: '👍 Favorevole', voters: TEAMS.filter((t) => state.mercato[t] === 'favorevole') },
    { key: 'contrario', label: '👎 Non favorevole', voters: TEAMS.filter((t) => state.mercato[t] === 'contrario') },
  ];

  return (
    <AnimatedSection>
      <h2><span className="num">5</span>Proposta: riapertura mercato in sosta nazionali</h2>
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
      <p style={{ marginTop: 16 }}>Sei d’accordo con la proposta?</p>
      <OptionCards options={OPTIONS} field="mercato" />
      <ResultBars rows={rows} />
    </AnimatedSection>
  );
}
