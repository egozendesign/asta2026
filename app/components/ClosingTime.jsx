import AnimatedSection from './AnimatedSection';

export default function ClosingTime() {
  return (
    <AnimatedSection>
      <h2><span className="num">3</span>Orario di Chiusura</h2>
      <p>
        Una volta fissato l’inizio si definisce la fine, che sarà <strong>tra le 2 e le 3 di notte</strong>.
        L’impegno di tutti è chiudere <strong>non oltre le 2</strong>, ma si chiede a tutti flessibilità
        vista la situazione di necessità che si è venuta a creare.
      </p>
      <ul className="timeline">
        <li>Inizio ore <strong>19</strong> o <strong>20</strong> (da definire col sondaggio 2)</li>
        <li>Durata piena stimata: <strong>6-7 ore</strong></li>
        <li>Chiusura target: <strong>ore 2</strong> — tolleranza massima ore 3</li>
      </ul>
    </AnimatedSection>
  );
}
