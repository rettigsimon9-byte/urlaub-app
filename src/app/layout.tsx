import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Urlaub App',
  description: 'Reiseplaner & digitales Fotobuch',
  viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="bg-[#f0f4f8] min-h-screen">{children}</body>
    </html>
  );
}
