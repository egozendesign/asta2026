# Asta Fantacalcio 2026 — pagina condivisa con PIN

App **React + Next.js** (App Router). Tema scuro/vetro/verde, animazioni con
Framer Motion, dati su Upstash Redis, login con PIN per squadra.

```
asta/
├── app/
│   ├── layout.jsx            # layout, font Inter, metadati
│   ├── page.jsx              # la pagina (compone i componenti)
│   ├── globals.css           # design system (scuro/vetro/verde) + Tailwind
│   ├── components/           # Hero, AuthBar, sezioni, voti, barre
│   ├── lib/constants.js      # elenco squadre (client + server)
│   └── api/state/route.js    # API: login, lettura pubblica, scrittura autenticata
├── public/logo.png           # logo statico
├── setup-env.cjs             # genera le env var (da eseguire in locale)
├── tailwind.config.mjs · postcss.config.mjs · next.config.mjs
└── package.json
```

## Sviluppo in locale

```bash
npm install
npm run dev      # http://localhost:3000
```

Per un test di produzione: `npm run build && npm start`. Senza le variabili
d'ambiente (sotto) la pagina si vede lo stesso, ma il login/salvataggio risponde
«Configurazione incompleta».

## 1. Genera le variabili d'ambiente

In locale, nella cartella del progetto:

```bash
node setup-env.cjs
```

Ti chiede i 10 PIN e stampa due valori: `TEAM_PINS` e `SESSION_SECRET`.
**Non salvare l'output in un file dentro il repo.**

## 2. Deploy su Vercel

1. Carica il progetto su GitHub, oppure `vercel` da CLI nella cartella.
   Vercel riconosce da solo **Next.js** (build automatica, `app/api` come
   funzioni). Nessun `vercel.json` necessario.

2. `Storage` → `Create Database` → **Upstash Redis** → collega al progetto.
   Crea automaticamente `KV_REST_API_URL` e `KV_REST_API_TOKEN`.
   Se i nomi hanno un prefisso diverso (es. `UPSTASH_REDIS_REST_URL`),
   aggiungi a mano due variabili con i nomi attesi.

3. `Settings` → `Environment Variables`: aggiungi `TEAM_PINS` e
   `SESSION_SECRET` dal passo 1. Marcale come **Sensitive**.

4. **Rifai il deploy.** Le env var non entrano in un deploy già esistente.

## Come funziona

- **Lettura pubblica**: chi ha il link vede tutti i voti senza PIN.
- **Scrittura autenticata**: si seleziona la squadra e si inserisce il PIN a
  4 cifre. Il server verifica e rilascia un cookie di sessione firmato HMAC,
  valido 30 giorni, `HttpOnly` + `Secure`.
- Ogni squadra può modificare **solo la propria riga**. Il controllo è
  lato server: la squadra viene letta dal cookie firmato, non da quello che
  manda il browser.
- Il PIN non viene mai salvato nel browser.
- Rate limiting: 8 tentativi falliti per IP, poi blocco di 15 minuti.
- La pagina si aggiorna dal server ogni 10 secondi e quando torna in primo piano.

## Reset dei dati

I dati stanno nella chiave Redis `asta2026:state`. Per azzerare, dalla console
Upstash: `DEL asta2026:state`.

## Limiti da tenere presenti

- **10 PIN a 4 cifre sono deboli.** Il rate limiting è per IP, quindi un
  attaccante con IP variabili può aggirarlo. Per un gruppo di amici va bene;
  non è una protezione seria.
- Stai riusando i PIN della pagina scambi: chi indovina un PIN qui lo ha
  anche là. Valuta PIN diversi per le due pagine.
- Chi conosce il PIN di una squadra può votare al posto suo. Non c'è modo di
  distinguere i due componenti di una squadra in coppia.
