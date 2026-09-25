import type { Metadata } from 'next';
import { TRPCProvider } from '@/components/TRPCProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'MergeMind',
  description: 'Semantic verification layer for parallel AI coding agents',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
