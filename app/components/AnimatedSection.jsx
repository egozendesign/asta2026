'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/* Sezione con reveal legato allo scroll.

   Due comportamenti, decisi al mount:
   1) se al primo render la sezione sta già dentro la finestra, compare SUBITO —
      insieme alle altre già visibili, senza cascata. Così lo schermo si riempie
      fino all'ultimo box che ci sta: su desktop sono parecchi, su mobile magari
      uno solo, e la differenza la fa la view, non un ritardo fisso;
   2) tutto quello che sta più in basso resta nascosto e si scopre scrollando,
      un box alla volta, quando entra davvero in vista (rootMargin negativo:
      deve essere dentro per un pezzo, non solo affacciato al bordo).

   La curva è una expo-out: copre quasi tutta la distanza all'inizio e si posa
   piano. Con prefers-reduced-motion: nessuno spostamento, durata 0. */

// quota di finestra entro cui un box è considerato "già in schermo" al load
const FILL = 0.9;

export default function AnimatedSection({ children, className }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (el.getBoundingClientRect().top < window.innerHeight * FILL) {
      setShown(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        io.disconnect();
      },
      { threshold: 0, rootMargin: '0px 0px -12% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const hidden = reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.995 };
  const visible = { opacity: 1, y: 0, scale: 1 };

  return (
    <motion.section
      ref={ref}
      className={className}
      initial={hidden}
      animate={shown ? visible : hidden}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }}
      transition={{ duration: reduce ? 0 : 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.section>
  );
}
