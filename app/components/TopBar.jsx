'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { TEAMS } from '../lib/constants';
import { useAsta } from './AstaProvider';
import Nav from './Nav';

const TITOLO = 'Campionato 26/27';

/* Intestazione condivisa da tutte le pagine: due box affiancati.

   A sinistra un quadrato con il solo logo. A destra il titolo, sotto al titolo
   i due pulsanti Asta/Mercato, e in basso a destra — sulla loro stessa riga —
   la squadra collegata con Esci (o i campi di accesso, se non si è entrati).

   Il contesto arriva da fuori (prop `ctx`) perché il mercato ha un provider
   suo: la sessione però è la stessa, stesso cookie e stesso PIN, quindi la
   barra è una sola invece di due copie da tenere allineate. Senza prop usa il
   contesto dell'asta.

   Sul titolo ripetuto: su desktop sta nel box di destra, su mobile accanto al
   logo in quello di sinistra. Sono due box distinti, ognuno col suo sfondo,
   quindi un solo elemento non può stare in entrambi e uno dei due è sempre
   nascosto. L'<h1> vero è uno solo — quello di destra, che su mobile resta nel
   documento per lettori di schermo e motori di ricerca — mentre la copia
   accanto al logo è puramente visiva e marcata aria-hidden. */
export default function TopBar({ ctx }) {
  const asta = useAsta();
  const { me, status, login, logout } = ctx ?? asta;
  const [team, setTeam] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const reduce = useReducedMotion();

  const doLogin = async () => {
    setBusy(true);
    const ok = await login(team, pin);
    if (ok) setPin('');
    setBusy(false);
  };

  // "aggiornato" è il messaggio a riposo e comparirebbe praticamente sempre:
  // rumore. Tutto il resto resta — salvataggi in corso, conferme ed errori —
  // altrimenti un'offerta rifiutata fallirebbe in silenzio.
  const statoDaMostrare = status.msg === 'aggiornato' ? null : status.msg;

  const rowAnim = reduce
    ? {}
    : {
        initial: { opacity: 0, y: -6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 6 },
        transition: { duration: 0.25 },
      };

  return (
    <div className="toprow">
      <div className="idbox">
        <motion.img
          className="idlogo"
          src="/logo.png"
          alt="Gli Amici di Maria — Stagione 2026/2027"
          width={178}
          height={178}
          initial={{ opacity: 0, scale: reduce ? 1 : 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 150, damping: 15 }}
        />
        <span className="idtitle" aria-hidden="true">{TITOLO}</span>
      </div>

      <div id="authbar" className="mainbox">
        <div className="mb-left">
          <h1 className="mbtitle">{TITOLO}</h1>
          <Nav />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {me ? (
            <motion.div className="mb-right" key="logged" {...rowAnim}>
              {statoDaMostrare && <span className={`mb-stato ${status.cls}`}>{statoDaMostrare}</span>}
              <span className="me-badge">✓ {me}</span>
              <button className="btn ghost" onClick={logout}>Esci</button>
            </motion.div>
          ) : (
            <motion.div className="mb-right" key="login" {...rowAnim}>
              {statoDaMostrare && <span className={`mb-stato ${status.cls}`}>{statoDaMostrare}</span>}
              <select
                id="who"
                aria-label="Squadra"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
              >
                <option value="">— seleziona —</option>
                {TEAMS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                placeholder="PIN"
                autoComplete="off"
                aria-label="PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') doLogin(); }}
              />
              <button className="btn" id="btnLogin" onClick={doLogin} disabled={busy}>Entra</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
