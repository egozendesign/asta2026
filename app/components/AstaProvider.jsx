'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

/* Stato condiviso + rete. Replica esatta della logica del vecchio <script>:
   lettura pubblica ogni 10s, scrittura autenticata, login/logout via cookie. */

const AstaCtx = createContext(null);
export const useAsta = () => useContext(AstaCtx);

const EMPTY = { loc: {}, orari: {}, nec: {}, necNote: {}, mercato: {} };

export default function AstaProvider({ children }) {
  const [state, setState] = useState(EMPTY);
  const [me, setMe] = useState(null);
  const [status, setStatus] = useState({ msg: 'caricamento…', cls: 'wait' });

  // ref per evitare closure "vecchie" dentro le callback stabili
  const meRef = useRef(null);
  useEffect(() => { meRef.current = me; }, [me]);

  const pull = useCallback(async () => {
    try {
      const r = await fetch('/api/state', { cache: 'no-store', credentials: 'same-origin' });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setMe(d.team || null);
      setState(d.state || EMPTY);
      setStatus({ msg: 'aggiornato', cls: 'ok' });
    } catch (e) {
      setStatus({ msg: e.message, cls: 'err' });
    }
  }, []);

  const push = useCallback(async (field, value) => {
    if (!meRef.current) return;
    setStatus({ msg: 'salvo…', cls: 'wait' });
    try {
      const r = await fetch('/api/state', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value }),
      });
      const d = await r.json();
      if (d.error) {
        if (r.status === 401) setMe(null);
        throw new Error(d.error);
      }
      setState(d.state);
      setStatus({ msg: 'salvato ✓', cls: 'ok' });
    } catch (e) {
      setStatus({ msg: e.message, cls: 'err' });
    }
  }, []);

  const login = useCallback(async (team, pin) => {
    if (!team) { setStatus({ msg: 'Seleziona la squadra', cls: 'err' }); return false; }
    if (!/^\d{4}$/.test(pin)) { setStatus({ msg: 'PIN: 4 cifre', cls: 'err' }); return false; }
    setStatus({ msg: 'verifico…', cls: 'wait' });
    try {
      const r = await fetch('/api/state?action=login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team, pin }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setMe(d.team);
      setState(d.state);
      setStatus({ msg: 'accesso effettuato ✓', cls: 'ok' });
      return true;
    } catch (e) {
      setStatus({ msg: e.message, cls: 'err' });
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/state?action=logout', { method: 'POST', credentials: 'same-origin' });
    setMe(null);
    setStatus({ msg: 'uscito', cls: 'wait' });
  }, []);

  const notify = useCallback((msg, cls) => setStatus({ msg, cls }), []);

  // polling: al mount, ogni 10s, e quando la pagina torna in primo piano
  useEffect(() => {
    pull();
    const id = setInterval(pull, 10000);
    const onVis = () => { if (!document.hidden) pull(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [pull]);

  return (
    <AstaCtx.Provider value={{ state, me, status, push, login, logout, notify }}>
      {children}
    </AstaCtx.Provider>
  );
}
