import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/styles/tokens.css';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Learn Language App (IELTS 6.5)',
  description: 'Personal Local-first Language Learning Platform',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        <Navbar />
        {children}
      </body>
    </html>
  );
}
