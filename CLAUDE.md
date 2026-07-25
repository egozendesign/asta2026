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
- Per i componenti, cerca su 21st.dev prima di scriverli da zero (vedi sotto).
- Mantieni spaziature coerenti (usa Tailwind `gap-4`, `p-6`).
- Assicurati che ogni elemento animato abbia un fallback per l'accessibilità (`prefers-reduced-motion`).

## 21st.dev

Due modi, stessa chiave. La chiave si crea su <https://21st.dev/settings/api-keys>
e inizia con `21st_sk_`; non va **mai** committata (vedi `.env.example`).

- **Server MCP** — configurato in `.mcp.json` come server HTTP `21st`
  (`https://21st.dev/api/mcp`), legge la chiave da `API_KEY_21ST`.
- **CLI** — il pacchetto è **`@21st-dev/cli`**, che installa il comando `21st`:

  ```bash
  npx @21st-dev/cli@latest search "combobox"
  npx @21st-dev/cli@latest add <autore>/<slug>
  ```

  Legge la chiave da `TWENTYFIRST_TOKEN`. Attenzione: `npx 21st` da solo **non
  esiste** su npm e restituisce 404; il pacchetto `@21st-dev/magic` è dismesso
  ed è rimasto solo come proxy di compatibilità.

Cercare è gratis; scaricare il codice di un componente consuma la quota
giornaliera del piano gratuito.

I componenti presi da 21st.dev vanno **adattati** al design system esistente
(variabili di `app/globals.css`: `--acc`, `--glass`, `--line`, ecc.), non
incollati con i loro stili originali.
