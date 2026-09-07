'use client';

import MercatoProvider, { useMercato } from '../components/mercato/MercatoProvider';
import MercatoTabs from '../components/mercato/MercatoTabs';
import TopBar from '../components/TopBar';

/* L'intestazione è la stessa della home: stessa sessione, stesso cookie.
   Serve un piccolo wrapper perché il contesto va letto dentro il provider. */
function Bar() {
  return <TopBar ctx={useMercato()} />;
}

export default function MercatoPage() {
  return (
    <MercatoProvider>
      <div className="wrap">
        <Bar />
        <MercatoTabs />
        {/* Nessun link al backoffice, da nessuna parte: l'indirizzo lo conosce
            solo chi lo deve usare. */}
        <footer>Il mercato si aggiorna automaticamente ogni 15 secondi</footer>
      </div>
    </MercatoProvider>
  );
}
