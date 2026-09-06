'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';

/* Barra di navigazione fra le due pagine dell'app.

   Vive dentro #authbar invece di essere una barra a sé: quel contenitore è già
   sticky, e due elementi sticky uno sopra l'altro finirebbero per accavallarsi
   e per mangiarsi mezzo schermo su mobile. Così la barra di menu e il login
   sono un blocco solo, sempre visibile mentre si scorre.

   L'indicatore della pagina attiva è un layoutId condiviso: scorre da una voce
   all'altra invece di sparire e ricomparire. Con prefers-reduced-motion la
   transizione ha durata 0 e resta solo il cambio di colore. */

const LINKS = [
  { href: '/', label: 'Asta' },
  { href: '/mercato', label: 'Mercato' },
];

export default function Nav() {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  return (
    <nav className="nav" aria-label="Sezioni del sito">
      {LINKS.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`nav-link${active ? ' on' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span>{l.label}</span>
            {active && (
              <motion.i
                className="nav-ink"
                layoutId="nav-ink"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
