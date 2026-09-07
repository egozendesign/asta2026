'use client';

import MercatoProvider, { useMercato } from '../components/mercato/MercatoProvider';
import PageHeader from '../components/PageHeader';
import MercatoTabs from '../components/mercato/MercatoTabs';
import AuthBar from '../components/AuthBar';

/* La barra di login è quella della home: stessa sessione, stesso cookie.
   Serve un piccolo wrapper perché il contesto va letto dentro il provider. */
function Bar() {
  const ctx = useMercato();
  return (
    <AuthBar
      ctx={ctx}
      // Da loggati nessun testo: la barra deve restare bassa, soprattutto su mobile.
      hint={
        ctx.me
          ? ''
          : 'Puoi leggere tutto senza PIN. Il PIN serve per offrire e proporre, ed è lo stesso della pagina dell’asta.'
      }
    />
  );
}

export default function MercatoPage() {
  return (
    <MercatoProvider>
      <div className="wrap">
        <PageHeader sezione="Mercato" pill="Scambi · Svincolati · Proposti" />
        <Bar />
        <MercatoTabs />
        {/* Nessun link al backoffice, da nessuna parte: l'indirizzo lo conosce
            solo chi lo deve usare. */}
        <footer>Il mercato si aggiorna automaticamente ogni 15 secondi</footer>
      </div>
    </MercatoProvider>
  );
}
