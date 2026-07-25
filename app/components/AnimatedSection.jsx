'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/* Sezione con reveal in entrata.

   Due comportamenti, decisi al mount:
   1) se la sezione è già dentro la finestra al primo accesso (tipico su desktop,
      dove il monitor mostra più box insieme) parte SUBITO, in cascata con le altre
      tramite `index` — così non serve muovere il mouse per vederla comparire;
   2) se sta più in basso, entra scrollando ma con un anticipo (rootMargin), così
      l'animazione è già finita quando il box arriva davvero in vista: niente
      "spazio vuoto e poi il box che scatta dentro".

   La curva è una expo-out lunga (0.7s): copre quasi tutta la distanza all'inizio
   e si posa piano, molto più morbida della vecchia 0.55s.
   Con prefers-reduced-motion: nessuno spostamento, nessun ritardo, durata 0. */
export default function AnimatedSection({ children, index = 0 }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const [reveal, setReveal] = useState(null); // null = ancora nascosta

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // già visibile al primo render → cascata immediata
    if (el.getBoundingClientRect().top < window.innerHeight) {
      setReveal({ delay: index * 0.08 });
      return;
    }

    // più in basso → observer con anticipo del 18% dell'altezza schermo
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setReveal({ delay: 0 });
        io.disconnect();
      },
      { threshold: 0, rootMargin: '0px 0px 18% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [index]);

  const hidden = reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.995 };
  const shown = { opacity: 1, y: 0, scale: 1 };

  return (
    <motion.section
      ref={ref}
      initial={hidden}
      animate={reveal ? shown : hidden}
      transition={{
        duration: reduce ? 0 : 0.7,
        ease: [0.16, 1, 0.3, 1],
        delay: reduce ? 0 : reveal?.delay ?? 0,
      }}
    >
      {children}
    </motion.section>
  );
}
