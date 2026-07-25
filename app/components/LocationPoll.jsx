'use client';

import AnimatedSection from './AnimatedSection';
import OptionCards from './OptionCards';
import ResultBars from './ResultBars';
import { TEAMS } from '../lib/constants';
import { useAsta } from './AstaProvider';

const OPTIONS = [
  { key: 'teatro', title: '🎭 Teatro Spazio', desc: 'La location abituale, quella di sempre.' },
  { key: 'cesano', title: '🏡 Casa del papà del Master — Cesano', desc: 'In giardino. Il papà sarà in casa, di questo ne parliamo in chat.' },
];

export default function LocationPoll() {
  const { state } = useAsta();
  const rows = [
    { key: 'teatro', label: '🎭 Teatro Spazio', voters: TEAMS.filter((t) => state.loc[t] === 'teatro') },
    { key: 'cesano', label: '🏡 Cesano', voters: TEAMS.filter((t) => state.loc[t] === 'cesano') },
  ];

  return (
    <AnimatedSection>
      <h2><span className="num">1</span>Sondaggio Location</h2>
      <p>Dove facciamo l’asta?</p>
      <OptionCards options={OPTIONS} field="loc" />
      <ResultBars rows={rows} />
    </AnimatedSection>
  );
}
