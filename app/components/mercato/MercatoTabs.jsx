'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useMercato } from './MercatoProvider';
import { OffertaForm, ScambioForm, PropostaForm } from './MercatoForms';
import AuctionList from './AuctionList';
import TradeList from './TradeList';
import ProposalList from './ProposalList';

/* Le tre sezioni del mercato. Layout come nell'originale: il form a sinistra
   (sticky su desktop), l'elenco a destra. L'indicatore della tab attiva è un
   layoutId condiviso, così scorre da una tab all'altra invece di saltare.

   Il cambio di contenuto NON passa da <AnimatePresence mode="wait">. Quel
   meccanismo tiene fuori il contenuto nuovo finché il vecchio non ha finito di
   uscire, e se durante l'uscita arriva un aggiornamento di stato (una
   cancellazione, una scrittura, il polling) l'uscita resta appesa e il nuovo
   contenuto non viene montato mai: la sezione resta vuota — o mostra ancora la
   lista precedente — mentre il badge, che sta fuori, si aggiorna regolarmente.
   Serviva un hard refresh per uscirne.

   Basta un motion.div con `key={active}`: cambiando chiave React rimonta il
   nodo e l'animazione di ingresso riparte da sola. Si perde solo la dissolvenza
   in uscita di 200ms, che nessuno nota, e non c'è più niente che possa
   incastrarsi. */

const TABS = [
  { id: 'scambi',     label: 'Scambi',     titolo: 'Proponi uno scambio',      Form: ScambioForm,  List: TradeList },
  { id: 'svincolati', label: 'Svincolati', titolo: 'Offerta per uno svincolato', Form: OffertaForm,  List: AuctionList },
  { id: 'proposti',   label: 'Proposti',   titolo: 'Metti un giocatore sul mercato', Form: PropostaForm, List: ProposalList },
];

export default function MercatoTabs() {
  const [active, setActive] = useState('svincolati');
  const { mercato } = useMercato();
  const reduce = useReducedMotion();

  const counts = {
    scambi: mercato.scambi.length,
    svincolati: mercato.svincolati.length,
    proposti: mercato.proposti.length,
  };

  const tab = TABS.find((t) => t.id === active) ?? TABS[1];
  const { Form, List } = tab;

  return (
    <>
      <div className="mk-tabs" role="tablist" aria-label="Sezioni del mercato">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            className={`mk-tab${active === t.id ? ' on' : ''}`}
            onClick={() => setActive(t.id)}
          >
            <span>{t.label}</span>
            <b>{counts[t.id]}</b>
            {active === t.id && (
              <motion.i
                className="mk-tab-ink"
                layoutId="mk-tab-ink"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="mk-grid">
        <aside className="mk-aside">
          <section className="mk-panel">
            <h2 className="ptitle">{tab.titolo}</h2>
            <motion.div
              key={active}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.2 }}
            >
              <Form />
            </motion.div>
          </section>
        </aside>

        <div className="mk-main">
          <motion.div
            key={active}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
          >
            <List />
          </motion.div>
        </div>
      </div>
    </>
  );
}
