'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { TEAMS } from '../lib/constants';
import { useAsta } from './AstaProvider';

export default function AuthBar() {
  const { me, status, login, logout } = useAsta();
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

  const rowAnim = reduce
    ? {}
    : {
        initial: { opacity: 0, y: -6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 6 },
        transition: { duration: 0.25 },
      };

  return (
    <div id="authbar">
      <AnimatePresence mode="wait" initial={false}>
        {me ? (
          <motion.div className="arow" key="logged" {...rowAnim}>
            <span className="me-badge">✓ {me}</span>
            <button className="btn ghost" onClick={logout}>Esci</button>
            <span className={`${status.cls}`} id="status2">{status.msg}</span>
          </motion.div>
        ) : (
          <motion.div className="arow" key="login" {...rowAnim}>
            <label htmlFor="who">Squadra</label>
            <select id="who" value={team} onChange={(e) => setTeam(e.target.value)}>
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
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') doLogin(); }}
            />
            <button className="btn" id="btnLogin" onClick={doLogin} disabled={busy}>Entra</button>
            <span className={`${status.cls}`} id="status">{status.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="hint">
        {me
          ? 'Puoi modificare solo la riga della tua squadra. Le altre sono in sola lettura.'
          : 'Puoi leggere tutto senza PIN. Il PIN serve solo per votare, ed è lo stesso della pagina scambi.'}
      </div>
    </div>
  );
}
