import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'CorpSol',
  description: 'Контроль и геймификация работы колл-центра',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
