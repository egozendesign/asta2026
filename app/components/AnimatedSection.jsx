'use client';

import { motion, useReducedMotion } from 'framer-motion';

/* Sezione con reveal quando entra nello schermo (whileInView: affidabile in SSR).
   initial + whileInView sono SEMPRE definiti sullo stesso elemento: così l'opacità
   arriva comunque a 1 e non resta mai "bloccata" a 0.
   Con prefers-reduced-motion: nessuno spostamento e durata 0 (comparsa istantanea). */
export default function AnimatedSection({ children, delay = 0 }) {
  const reduce = useReducedMotion();

  return (
    <motion.section
      initial={{ opacity: 0, y: reduce ? 0 : 28, scale: reduce ? 1 : 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: reduce ? 0 : 0.55, ease: [0.2, 0.8, 0.2, 1], delay }}
    >
      {children}
    </motion.section>
  );
}
