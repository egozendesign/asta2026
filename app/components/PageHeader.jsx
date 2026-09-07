'use client';

import { motion, useReducedMotion } from 'framer-motion';

const ALT = 'Gli Amici di Maria — Stagione 2026/2027';
const TITOLO = 'Fantacalcio 26/27';

/* Header condiviso da tutte le pagine: logo a sinistra, testo a destra.

   Prima erano due componenti quasi identici (Hero e MercatoHero) che
   divergevano nei dettagli. Cambiano solo due parole per pagina — il nome della
   sezione e il contenuto della pastiglia verde — quindi arrivano da fuori.

   Su mobile resta la stessa disposizione del desktop, in riga: prima andava in
   colonna con il logo a 148px e occupava mezzo schermo, obbligando a scorrere
   tutto per arrivare ai contenuti. */
export default function PageHeader({ sezione, pill }) {
  const reduce = useReducedMotion();

  const reveal = (delay) => ({
    initial: { opacity: 0, y: reduce ? 0 : 14 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0 },
    transition: { duration: reduce ? 0 : 0.5, delay: reduce ? 0 : delay, ease: [0.2, 0.8, 0.2, 1] },
  });

  return (
    <header>
      <div className="hero">
        <motion.img
          className="logo"
          src="/logo.png"
          alt={ALT}
          width={178}
          height={178}
          initial={{ opacity: 0, scale: reduce ? 1 : 0.8, rotate: reduce ? 0 : -6 }}
          whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
          viewport={{ once: true, amount: 0 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 140, damping: 14, delay: 0.05 }}
        />
        <div className="hero-text">
          <motion.h1 {...reveal(0.15)}>{TITOLO}</motion.h1>
          <motion.div className="hero-sez" {...reveal(0.22)}>{sezione}</motion.div>
          <motion.div className="date" {...reveal(0.3)}>{pill}</motion.div>
        </div>
      </div>
    </header>
  );
}
