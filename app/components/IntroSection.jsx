import AnimatedSection from './AnimatedSection';

export default function IntroSection() {
  return (
    <AnimatedSection>
      <h2><span className="num">!</span>Perché di giovedì sera</h2>
      <p>
        Ci servono <strong>36 giornate piene</strong> per completare i 4 gironi. La{' '}
        <strong>3ª giornata di Serie A inizia venerdì 4 settembre alle 20.45</strong>, quindi l’asta va
        chiusa obbligatoriamente entro giovedì notte.
      </p>
      <div className="note">
        Serve la <strong>collaborazione di tutti</strong>: turni rapidi, niente pause infinite, liste
        già pronte. L’obiettivo è che ognuno costruisca la propria rosa senza arrivare alle 4 del
        mattino.
      </div>
    </AnimatedSection>
  );
}
