import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata = {
  title: 'Asta Fantacalcio — Giovedì 3 Settembre 2026',
  description: 'Pagina di coordinamento per l’asta del Fantacalcio 2026/27. Le risposte sono condivise e visibili a tutti.',
  icons: { icon: '/logo.png' },
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
