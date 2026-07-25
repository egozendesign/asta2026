'use client';

import { motion, useReducedMotion } from 'framer-motion';

const ALT = 'Gli Amici di Maria — Stagione 2026/2027';
const H1 = 'Asta Fantacalcio 2026/27';
const DATE = '⚽ Giovedì 3 Settembre 2026';
const SUB = 'Pagina di coordinamento — le risposte sono condivise e visibili a tutti';

/* Header: logo grande a sinistra, blocco testo a destra (in colonna su mobile).
   Animazioni via whileInView (l'header è in vista al caricamento, quindi parte
   subito) con stagger fatto a delay crescenti. initial + whileInView sempre
   presenti → l'opacità arriva a 1 in ogni caso. Reduced motion → durata 0. */
export default function Hero() {
  const reduce = useReducedMotion();

  // reveal riutilizzabile per gli elementi di testo
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
          <motion.h1 {...reveal(0.15)}>{H1}</motion.h1>
          <motion.div className="date" {...reveal(0.24)}>{DATE}</motion.div>
          <motion.div className="sub" {...reveal(0.33)}>{SUB}</motion.div>
        </div>
      </div>
    </header>
  );
}
