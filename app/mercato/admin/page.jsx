'use client';

import MercatoProvider from '../../components/mercato/MercatoProvider';
import AdminPanel from '../../components/mercato/AdminPanel';
import Link from 'next/link';

/* Il backoffice sta sotto /mercato ma fuori dalla barra di menu: non e' una
   sezione del sito, e' uno strumento. Chi ci arriva senza il codice vede solo
   la richiesta del codice. */
export default function AdminPage() {
  return (
    <MercatoProvider>
      <div className="wrap">
        <header>
          <div className="hero">
            <div className="hero-text">
              <h1>Backoffice mercato</h1>
              <div className="sub">
                Modifica e cancellazione delle righe inserite dalle squadre.
              </div>
              <div style={{ marginTop: 14 }}>
                <Link href="/mercato" className="mk-back">← Torna al mercato</Link>
              </div>
            </div>
          </div>
        </header>
        <AdminPanel />
      </div>
    </MercatoProvider>
  );
}
