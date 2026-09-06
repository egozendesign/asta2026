# Asta Fantacalcio 2026 — pagina condivisa con PIN

App **React + Next.js** (App Router). Tema scuro/vetro/verde, animazioni con
Framer Motion, dati su Upstash Redis, login con PIN per squadra.

```
asta/
├── app/
│   ├── layout.jsx            # layout, font Inter, metadati
│   ├── page.jsx              # home dell'asta (compone i componenti)
│   ├── mercato/page.jsx      # /mercato — scambi, svincolati, proposti
│   ├── globals.css           # design system (scuro/vetro/verde) + Tailwind
│   ├── components/           # Hero, AuthBar, sezioni, voti, barre
│   │   └── mercato/          # provider, tab, form e liste del mercato
│   ├── lib/constants.js      # elenco squadre (client + server)
│   ├── lib/session.js        # sessione, Redis e rate limiting (condivisi)
│   ├── lib/mercato.js        # costanti, validazione e derivazione delle aste
│   ├── api/state/route.js    # API asta: login, lettura pubblica, scrittura
│   └── api/mercato/route.js  # API mercato: offerte, scambi, proposte
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

## Il mercato (`/mercato`)

Porting della vecchia app statica `new-mercato`, che girava su Airtable. Tre
sezioni:

- **Svincolati** — aste al rialzo. La prima offerta su un giocatore apre l'asta
  e fa partire 24 ore; dopo la scadenza il giocatore è aggiudicato a chi ha
  offerto di più (a parità di importo vince chi ha offerto per primo).
- **Scambi** — proposte di scambio fra due squadre, con crediti facoltativi da
  una parte o dall'altra. Restano in bacheca 24 ore.
- **Proposti** — giocatori messi a disposizione, con i ruoli cercati in cambio.

Il login è **lo stesso dell'asta**: stesso PIN, stesso cookie. Chi è già entrato
sulla home può offrire senza rifare l'accesso.

### Perché Redis basta

Il mercato è **append-only**: un'asta non è una riga che si aggiorna, è la somma
delle offerte ricevute per quel giocatore, ricostruita a ogni lettura da
`deriveAuctions()`. Le offerte si accodano con `RPUSH`, che è atomico, quindi due
rilanci simultanei si accodano entrambi e nessuno si perde — senza lock e senza
scrittura ottimistica.

Chiavi Redis usate (liste):

```
asta2026:mercato:svincolati
asta2026:mercato:scambi
asta2026:mercato:proposti
```

Ogni lista è limitata alle 500 righe più recenti (`LTRIM`).

### Cosa è cambiato rispetto a new-mercato

| new-mercato | qui |
|---|---|
| Token Airtable di scrittura in chiaro in `config.js` | nessun segreto nel client, si parla solo con `/api/mercato` |
| Password squadra in chiaro nel client | sessione PIN esistente, verificata lato server |
| La squadra si sceglieva da una tendina | la squadra è quella del cookie firmato: non si offre a nome di altri |
| Si poteva offrire su un'asta già scaduta | rifiutato con 409 |
| Si poteva offrire meno dell'offerta in testa | rifiutato con 409 |
| Si potevano scegliere due volte lo stesso ruolo | selezione a chip, il doppione non è rappresentabile |
| Rate limiting client-side per la quota Airtable | cooldown di 3s per squadra lato server |

## Reset dei dati

I voti dell'asta stanno nella chiave `asta2026:state`, il mercato nelle tre
liste `asta2026:mercato:*`. Per azzerare, dalla console Upstash:

```
DEL asta2026:state
DEL asta2026:mercato:svincolati
DEL asta2026:mercato:scambi
DEL asta2026:mercato:proposti
```

## Limiti da tenere presenti

- **10 PIN a 4 cifre sono deboli.** Il rate limiting è per IP, quindi un
  attaccante con IP variabili può aggirarlo. Per un gruppo di amici va bene;
  non è una protezione seria.
- Asta e mercato condividono la stessa sessione: chi indovina un PIN entra in
  entrambe le sezioni.
- Chi conosce il PIN di una squadra può votare al posto suo. Non c'è modo di
  distinguere i due componenti di una squadra in coppia.
