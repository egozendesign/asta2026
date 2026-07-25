'use client';

import AstaProvider from './components/AstaProvider';
import Hero from './components/Hero';
import AuthBar from './components/AuthBar';
import IntroSection from './components/IntroSection';
import LocationPoll from './components/LocationPoll';
import TimePoll from './components/TimePoll';
import ClosingTime from './components/ClosingTime';
import RulesIntro from './components/RulesIntro';
import RuleForm from './components/RuleForm';
import MarketProposal from './components/MarketProposal';
import RuleList from './components/RuleList';

/* Le sezioni entrano da sole in base allo scroll (vedi AnimatedSection): qui si
   decide solo l'ordine. I box numerati in verde sono i 4 argomenti; sotto la
   sezione 4 partono le proposte di regolamento, numerate in rosso da 1. */
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
        <RulesIntro />
        <RuleForm />
        <MarketProposal n={1} />
        <RuleList startAt={2} />
        <footer>Le risposte si aggiornano automaticamente ogni 10 secondi · Asta 3 settembre 2026</footer>
      </div>
    </AstaProvider>
  );
}
