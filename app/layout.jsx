import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const TITOLO = 'Campionato Amici di Maria 26/27';
const DESCRIZIONE = 'Pagina parallela per operazioni di mercato e organizzative.';

/* Titolo e descrizione finiscono anche nell'anteprima dei link (WhatsApp,
   Telegram, iMessage…), che li legge dai meta tag Open Graph.

   L'immagine e' /og.png e non /logo.png: il logo e' un PNG con lo sfondo
   trasparente, e chi genera l'anteprima appoggia la trasparenza sul bianco.
   og.png ha il fondo scuro del sito gia' dentro, quindi si vede scuro ovunque.

   metadataBase serve a Next per trasformare '/og.png' in un URL assoluto:
   senza, le anteprime esterne non riescono a scaricare l'immagine. */
export const metadata = {
  metadataBase: new URL('https://asta2026.vercel.app'),
  title: TITOLO,
  description: DESCRIZIONE,
  icons: { icon: '/logo.png' },
  openGraph: {
    type: 'website',
    locale: 'it_IT',
    siteName: TITOLO,
    title: TITOLO,
    description: DESCRIZIONE,
    images: [{
      url: '/og.png',
      width: 600,
      height: 600,
      alt: 'Gli Amici di Maria — Stagione 2026/2027',
    }],
  },
};

export const viewport = {
  themeColor: '#121815',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="it" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
