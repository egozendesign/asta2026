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

export default function Page() {
  return (
    <AstaProvider>
      <div className="wrap">
        <Hero />
        <AuthBar />
        <IntroSection />
        <LocationPoll />
        <TimePoll />
        <ClosingTime />
        <NeedsTable />
        <MarketProposal />
        <footer>Le risposte si aggiornano automaticamente ogni 10 secondi · Asta 3 settembre 2026</footer>
      </div>
    </AstaProvider>
  );
}
