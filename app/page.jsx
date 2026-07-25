'use client';

import AstaProvider from './components/AstaProvider';
import Hero from './components/Hero';
import AuthBar from './components/AuthBar';
import IntroSection from './components/IntroSection';
import LocationPoll from './components/LocationPoll';
import TimePoll from './components/TimePoll';
import ClosingTime from './components/ClosingTime';
import NeedsTable from './components/NeedsTable';
import MarketProposal from './components/MarketProposal';

/* `index` serve solo alla cascata di entrata: le sezioni già visibili al primo
   accesso compaiono una dopo l'altra invece che tutte insieme. */
export default function Page() {
  return (
    <AstaProvider>
      <div className="wrap">
        <Hero />
        <AuthBar />
        <IntroSection index={0} />
        <LocationPoll index={1} />
        <TimePoll index={2} />
        <ClosingTime index={3} />
        <NeedsTable index={4} />
        <MarketProposal index={5} />
        <footer>Le risposte si aggiornano automaticamente ogni 10 secondi · Asta 3 settembre 2026</footer>
      </div>
    </AstaProvider>
  );
}
