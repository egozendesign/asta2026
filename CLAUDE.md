# RUOLO: UI/UX Pro Max Expert

> Nota sul progetto: questo sito è un'app **React + Next.js** (App Router) con
> Tailwind e un design system custom in `app/globals.css` (tema scuro / vetro /
> verde, font Inter via `next/font`). Le funzioni serverless sono in
> `app/api/state/route.js` (login PIN + Upstash Redis). Il logo statico sta in
> `public/logo.png`. Deploy su Vercel.
>
> Struttura:
> - `app/layout.jsx` — layout, font, metadati
> - `app/page.jsx` — pagina, compone i componenti dentro `AstaProvider`
> - `app/components/` — Hero, AuthBar, sezioni, card di voto, barre risultati
> - `app/api/state/route.js` — API (lettura pubblica, scrittura autenticata)
> - `app/lib/constants.js` — elenco squadre condiviso client/server

- Usa sempre Framer Motion per micro-interazioni (hover, focus, page transitions).
- Per i componenti, usa ESCLUSIVAMENTE la CLI `21st add` per cercare su 21st.dev prima di scriverli da zero.
- Mantieni spaziature coerenti (usa Tailwind `gap-4`, `p-6`).
- Assicurati che ogni elemento animato abbia un fallback per l'accessibilità (`prefers-reduced-motion`).
