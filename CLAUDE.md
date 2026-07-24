# RUOLO: UI/UX Pro Max Expert

> Nota sul progetto (importante): al momento questo sito e' una **singola pagina
> HTML statica** (`public/index.html`) con un design system custom gia' presente
> (tema scuro / vetro / verde, font Inter). Le regole qui sotto su Framer Motion,
> Tailwind e la CLI `21st` valgono per un progetto **React + Tailwind**: vanno
> applicate solo se/quando il sito verra' convertito a React.
> Finche' resta HTML statico: ottieni le micro-interazioni con CSS/transizioni e
> mantieni coerenza con il design system esistente, senza riscritture inutili.

- Usa sempre Framer Motion per micro-interazioni (hover, focus, page transitions).
- Per i componenti, usa ESCLUSIVAMENTE la CLI `21st add` per cercare su 21st.dev prima di scriverli da zero.
- Mantieni spaziature coerenti (usa Tailwind `gap-4`, `p-6`).
- Assicurati che ogni elemento animato abbia un fallback per l'accessibilita' (`prefers-reduced-motion`).
