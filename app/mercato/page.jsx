'use client';

import MercatoProvider, { useMercato } from '../components/mercato/MercatoProvider';
import MercatoHero from '../components/mercato/MercatoHero';
import MercatoTabs from '../components/mercato/MercatoTabs';
import AuthBar from '../components/AuthBar';

/* La barra di login è quella della home: stessa sessione, stesso cookie.
   Serve un piccolo wrapper perché il contesto va letto dentro il provider. */
function Bar() {
  const ctx = useMercato();
  return (
    <AuthBar
      ctx={ctx}
      hint={
        ctx.me
          ? 'Puoi ritirare solo le offerte e le proposte della tua squadra.'
          : 'Puoi leggere tutto senza PIN. Il PIN serve per offrire e proporre, ed è lo stesso della pagina dell’asta.'
      }
    />
  );
}

export default function MercatoPage() {
  return (
    <MercatoProvider>
      <div className="wrap">
        <MercatoHero />
        <Bar />
        <MercatoTabs />
        <footer>Il mercato si aggiorna automaticamente ogni 15 secondi</footer>
      </div>
    </MercatoProvider>
  );
}
