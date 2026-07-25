import AnimatedSection from './AnimatedSection';

/* Box 4 — apre la sezione delle proposte di regolamento: spiega perché si
   discute qui e non la sera dell'asta. Sotto arrivano il form e le proposte. */
export default function RulesIntro() {
  return (
    <AnimatedSection>
      <h2><span className="num">4</span>Proposte di modifica del regolamento</h2>
      <p>
        Quest’anno il tempo prima dell’asta non c’è: non possiamo permetterci di aprire discussioni
        sul regolamento la sera stessa, in dieci intorno a un tavolo e con l’orologio che corre.
      </p>
      <p>
        Per questo <strong>ogni proposta di modifica si fa qui</strong>, in anticipo: si scrive, la si
        legge con calma nei giorni che restano e si vota. L’obiettivo è arrivare al{' '}
        <strong>3 settembre con il regolamento già definito</strong> e dedicare la serata solo all’asta.
      </p>
      <div className="note info">
        Ogni proposta ha un numero, il nome di chi l’ha presentata e due pulsanti per dire se sei{' '}
        <strong>favorevole</strong> o <strong>no</strong>. Le nuove proposte si aggiungono in fondo,
        numerate in ordine di arrivo.
      </div>
    </AnimatedSection>
  );
}
