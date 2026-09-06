'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

/* Stato e rete del mercato. Stessa struttura di AstaProvider — lettura pubblica
   in polling, scrittura autenticata — ma su /api/mercato.

   Il login resta su /api/state: la sessione è una sola, chi è già entrato per
   votare sulla home si ritrova già dentro anche qui. Nell'app originale invece
   ogni form chiedeva una password di squadra, che stava in chiaro nel client. */

const MercatoCtx = createContext(null);
export const useMercato = () => useContext(MercatoCtx);

const EMPTY = { svincolati: [], scambi: [], proposti: [], updated: null };

// L'originale aggiornava ogni 30s con quote e lock perché ogni lettura
// consumava la quota gratuita di Airtable. Qui il dato è nostro: 15s, in linea
// con i 10s della home.
const POLL_MS = 15000;

export default function MercatoProvider({ children }) {
  const [mercato, setMercato] = useState(EMPTY);
  const [me, setMe] = useState(null);
  // `admin` e' il backoffice autenticato: sessione separata da quella di
  // squadra, con un cookie suo. `adminAvailable` dice se ADMIN_PIN e' stato
  // configurato: senza, il pannello non ha senso e non va nemmeno proposto.
  const [admin, setAdmin] = useState(false);
  const [adminAvailable, setAdminAvailable] = useState(false);
  // 'ok' | 'missing' | 'short': serve a dire *perche'* il pannello e' chiuso
  const [adminStatus, setAdminStatus] = useState('missing');
  const [status, setStatus] = useState({ msg: 'caricamento…', cls: 'wait' });

  const meRef = useRef(null);
  useEffect(() => { meRef.current = me; }, [me]);

  const pull = useCallback(async () => {
    try {
      const r = await fetch('/api/mercato', { cache: 'no-store', credentials: 'same-origin' });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setMe(d.team || null);
      setAdmin(Boolean(d.admin));
      setAdminAvailable(Boolean(d.adminAvailable));
      setAdminStatus(d.adminStatus || 'missing');
      setMercato(d.mercato || EMPTY);
      setStatus({ msg: 'aggiornato', cls: 'ok' });
    } catch (e) {
      setStatus({ msg: e.message, cls: 'err' });
    }
  }, []);

  /* Azione di scrittura. Ritorna true/false così il form sa se può svuotarsi:
     un invio rifiutato deve lasciare i campi pieni, altrimenti si riscrive tutto. */
  const send = useCallback(async (action, payload) => {
    if (!meRef.current) {
      setStatus({ msg: 'Inserisci il PIN per partecipare', cls: 'err' });
      return false;
    }
    setStatus({ msg: 'invio…', cls: 'wait' });
    try {
      const r = await fetch(`/api/mercato?action=${action}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.error) {
        if (r.status === 401) setMe(null);
        throw new Error(d.error);
      }
      setMercato(d.mercato);
      setStatus({ msg: 'inviato ✓', cls: 'ok' });
      return true;
    } catch (e) {
      setStatus({ msg: e.message, cls: 'err' });
      return false;
    }
  }, []);

  const offri = useCallback((nome, offerta) => send('offerta', { nome, offerta }), [send]);
  const proponiScambio = useCallback((payload) => send('scambio', payload), [send]);
  const proponiGiocatore = useCallback((nome, ruoli) => send('proposta', { nome, ruoli }), [send]);
  const cancella = useCallback((lista, id) => send('del', { lista, id }), [send]);

  /* --- backoffice --- */

  const adminSend = useCallback(async (action, payload) => {
    setStatus({ msg: 'salvo…', cls: 'wait' });
    try {
      const r = await fetch(`/api/mercato?action=${action}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.error) {
        if (r.status === 401) setAdmin(false);
        throw new Error(d.error);
      }
      if (d.mercato) setMercato(d.mercato);
      // renamed = quante ALTRE offerte della stessa asta hanno seguito il
      // cambio di nome. Vale la pena dirlo: e' una scrittura che l'admin non
      // ha chiesto riga per riga.
      setStatus({
        msg: d.renamed ? `salvato ✓ (${d.renamed} rilanci rinominati)` : 'salvato ✓',
        cls: 'ok',
      });
      return true;
    } catch (e) {
      setStatus({ msg: e.message, cls: 'err' });
      return false;
    }
  }, []);

  const adminLogin = useCallback(async (pin) => {
    setStatus({ msg: 'verifico…', cls: 'wait' });
    try {
      const r = await fetch('/api/mercato?action=admin-login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setAdmin(true);
      if (d.mercato) setMercato(d.mercato);
      setStatus({ msg: 'backoffice aperto ✓', cls: 'ok' });
      return true;
    } catch (e) {
      setStatus({ msg: e.message, cls: 'err' });
      return false;
    }
  }, []);

  const adminLogout = useCallback(async () => {
    await fetch('/api/mercato?action=admin-logout', { method: 'POST', credentials: 'same-origin' });
    setAdmin(false);
    setStatus({ msg: 'uscito dal backoffice', cls: 'wait' });
  }, []);

  const adminEdit = useCallback(
    (lista, id, patch) => adminSend('admin-edit', { lista, id, patch }),
    [adminSend]
  );
  const adminDel = useCallback((lista, id) => adminSend('admin-del', { lista, id }), [adminSend]);

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
      await pull();
      setStatus({ msg: 'accesso effettuato ✓', cls: 'ok' });
      return true;
    } catch (e) {
      setStatus({ msg: e.message, cls: 'err' });
      return false;
    }
  }, [pull]);

  const logout = useCallback(async () => {
    await fetch('/api/state?action=logout', { method: 'POST', credentials: 'same-origin' });
    setMe(null);
    setStatus({ msg: 'uscito', cls: 'wait' });
  }, []);

  useEffect(() => {
    pull();
    const id = setInterval(pull, POLL_MS);
    const onVis = () => { if (!document.hidden) pull(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [pull]);

  return (
    <MercatoCtx.Provider
      value={{
        mercato, me, status, login, logout,
        offri, proponiScambio, proponiGiocatore, cancella,
        admin, adminAvailable, adminStatus, adminLogin, adminLogout, adminEdit, adminDel,
      }}
    >
      {children}
    </MercatoCtx.Provider>
  );
}
