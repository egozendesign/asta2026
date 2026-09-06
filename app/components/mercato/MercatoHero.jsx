'use client';

import { motion, useReducedMotion } from 'framer-motion';

const ALT = 'Gli Amici di Maria — Stagione 2026/2027';

/* Stessa ricetta dell'header della home (logo a sinistra, testo a destra): le
   due pagine condividono la sessione, quindi devono anche sembrare la stessa
   app. Il ritorno all'asta non sta qui ma nella barra di menu (Nav), sempre a
   schermo: due link di navigazione impilati erano solo rumore. */
export default function MercatoHero() {
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
          <motion.h1 {...reveal(0.15)}>Mercato 26/27</motion.h1>
          <motion.div className="date" {...reveal(0.24)}>Scambi · Svincolati · Proposti</motion.div>
          <motion.div className="sub" {...reveal(0.33)}>
            Le offerte sono pubbliche e si aggiornano da sole. Per partecipare serve il PIN della tua
            squadra, lo stesso della pagina dell’asta.
          </motion.div>
        </div>
      </div>
    </header>
  );
}
