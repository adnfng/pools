import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Pool Type',
  description: 'A little pool-ball typewriter. Type something, then give it a spin.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
