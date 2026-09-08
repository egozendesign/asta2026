'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useMercato } from './MercatoProvider';
import { deriveAuctions, findSvincolo, formatDate, LIMITS } from '../../lib/mercato';
import Countdown from './Countdown';

/* Rilancio dentro la scheda dell'asta.

   Prima l'unico modo di rilanciare era riscrivere il nome del giocatore nel
   form in alto, identico carattere per carattere: una lettera diversa e invece
   di rilanciare si apriva un'asta parallela. Qui il nome non si scrive proprio,
   si manda la chiave dell'asta e il nome lo mette il server.

   Visibile a chiunque sia entrato col PIN, compresa la squadra che è in testa:
   rilanciare su se stessi è inutile ma non è un errore, e nasconderlo
   costringerebbe a spiegare perché il riquadro a volte non c'è. */
function Rilancio({ asta }) {
  const { me, rilancia } = useMercato();
  const [offerta, setOfferta] = useState('');
  const [busy, setBusy] = useState(false);

  if (!me) {
    return (
      <p className="mk-rilancio-hint">Inserisci il PIN della tua squadra per rilanciare.</p>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await rilancia(asta.key, offerta);
    if (ok) setOfferta('');
    setBusy(false);
  };

  return (
    <form className="mk-rilancio" onSubmit={submit}>
      <label className="mk-label" htmlFor={`ril-${asta.key}`}>Rilancia</label>
      <input
        id={`ril-${asta.key}`}
        type="number"
        inputMode="numeric"
        min={asta.highestBid + 1}
        max={LIMITS.offertaMax}
        value={offerta}
        onChange={(e) => setOfferta(e.target.value)}
        placeholder={`min ${asta.highestBid + 1}`}
        required
      />
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Invio…' : 'Rilancia'}
      </button>
    </form>
  );
}

/* Chi si aggiudica un giocatore con la rosa piena deve liberarne uno.

   Quel nome finora non aveva un posto dove stare: si diceva nel gruppo e
   spariva, e a fine mercato nessuno sapeva più chi aveva svincolato chi. Qui
   sta attaccato all'asta che lo ha reso necessario.

   Compare solo a asta chiusa: prima non c'è ancora niente da svincolare. Lo
   scrive solo la squadra che ha vinto, e una volta sola — è un impegno verso
   le altre squadre, non un appunto privato, e poterlo riscrivere dopo aver
   visto come si muove il mercato lo svuoterebbe di senso. Per questo il campo
   sparisce appena è compilato e resta la riga in chiaro per tutti; per un
   refuso c'è il backoffice. E per questo si salva in due tempi: una conferma
   costa un click, un nome sbagliato costa un giro dall'admin. */
function Svincolo({ asta, record }) {
  const { me, svincola } = useMercato();
  const [valore, setValore] = useState('');
  const [conferma, setConferma] = useState(false);
  const [busy, setBusy] = useState(false);
  const reduce = useReducedMotion();

  const salvato = record?.nome || '';
  const vincitore = Boolean(me) && asta.leadingTeam === me;

  if (salvato || !vincitore) {
    if (!salvato) return null;
    return (
      <p className="mk-svincolo ro">
        <span className="mk-label">Svincola</span>
        <span className="mk-svincolo-nome">{salvato}</span>
      </p>
    );
  }

  const pulito = valore.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (pulito.length < 3) return;
    // primo invio: si chiede conferma, non si scrive niente
    if (!conferma) { setConferma(true); return; }
    setBusy(true);
    await svincola(asta.key, pulito);
    setBusy(false);
    setConferma(false);
  };

  return (
    <form className="mk-svincolo" onSubmit={submit}>
      <label className="mk-label" htmlFor={`svi-${asta.key}`}>Giocatore da svincolare</label>
      <input
        id={`svi-${asta.key}`}
        value={valore}
        maxLength={LIMITS.nome}
        placeholder="Es. L.Martinez - Inter - Pc"
        onChange={(e) => { setValore(e.target.value); setConferma(false); }}
      />
      <button className="btn" type="submit" disabled={busy || pulito.length < 3}>
        {busy ? 'Salvo…' : conferma ? 'Confermo' : 'Dichiara'}
      </button>

      <AnimatePresence initial={false}>
        {conferma && (
          <motion.p
            className="mk-svincolo-conf"
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
          >
            Svincoli <strong>{pulito}</strong> per prendere {asta.displayName}? Premi ancora per
            confermare: dopo non si cambia.
          </motion.p>
        )}
      </AnimatePresence>

      <p className="mk-svincolo-hint">
        Hai vinto {asta.displayName}: se per prenderlo devi liberare uno slot, scrivi qui chi
        svincoli (cognome - squadra - ruolo). Si dichiara una volta sola. Se non devi svincolare
        nessuno, lascia il campo vuoto.
      </p>
    </form>
  );
}

/* Le aste non sono righe salvate: si ricostruiscono dalle offerte a ogni
   render (vedi deriveAuctions). `tick` esiste solo per rifare il calcolo
   quando un cronometro arriva a zero, così la card passa da aperta a chiusa
   senza aspettare il polling. */
export default function AuctionList() {
  const { mercato, me, cancella } = useMercato();
  const svincoli = mercato.svincoli || [];
  const [open, setOpen] = useState(() => new Set());
  const [tick, setTick] = useState(0);
  const reduce = useReducedMotion();

  const auctions = useMemo(
    () => deriveAuctions(mercato.svincolati, Date.now()),
    // tick forza il ricalcolo alla scadenza di un'asta
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mercato.svincolati, tick]
  );

  const toggle = (key) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (auctions.length === 0) {
    return <p className="mk-empty">Nessuna offerta ancora. La prima apre l’asta e fa partire le 24 ore.</p>;
  }

  return (
    <div className="mk-list">
      {auctions.map((a) => {
        const isOpen = open.has(a.key);
        const mine = a.leadingTeam === me;

        return (
          <motion.article
            key={a.key}
            layout={!reduce}
            className={`mk-card${a.closed ? ' closed' : ''}${mine ? ' mine' : ''}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mk-card-head">
              <div className="mk-card-title">
                <h3>{a.displayName}</h3>
                <span className="mk-sub">
                  {a.bids.length} offert{a.bids.length === 1 ? 'a' : 'e'} · apertura {formatDate(new Date(a.firstBidAt).toISOString())}
                </span>
              </div>

              <div className="mk-card-figure">
                <span className="mk-amount">{a.highestBid}<i>FM</i></span>
                <span className={`mk-leader${mine ? ' me' : ''}`}>{a.leadingTeam}</span>
              </div>

              <div className="mk-card-state">
                {a.closed ? (
                  <span className="mk-badge done">Aggiudicato</span>
                ) : (
                  <>
                    <span className="mk-label">Tempo rimasto</span>
                    <Countdown endsAt={a.endsAt} onEnd={() => setTick((t) => t + 1)} />
                  </>
                )}
              </div>
            </div>

            {a.closed
              ? <Svincolo asta={a} record={findSvincolo(svincoli, a.key, a.leadingTeam)} />
              : <Rilancio asta={a} />}

            <button
              type="button"
              className="mk-toggle"
              onClick={() => toggle(a.key)}
              aria-expanded={isOpen}
            >
              {isOpen ? 'Nascondi rilanci' : `Mostra tutti i rilanci (${a.bids.length})`}
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.ul
                  className="mk-bids"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ duration: reduce ? 0 : 0.25, ease: [0.16, 1, 0.3, 1] }}
                >
                  {[...a.bids].reverse().map((b) => (
                    <li key={b.id} className={b.team === a.leadingTeam && b.offer === a.highestBid ? 'top' : ''}>
                      <span className="mk-bid-team">{b.team}</span>
                      <span className="mk-bid-offer">{b.offer} FM</span>
                      <span className="mk-bid-date">{formatDate(new Date(b.ts).toISOString())}</span>
                      {b.team === me && !a.closed && (
                        <button
                          type="button"
                          className="mk-del"
                          onClick={() => cancella('svincolati', b.id)}
                          title="Ritira questa offerta"
                        >
                          Ritira
                        </button>
                      )}
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </motion.article>
        );
      })}
    </div>
  );
}
