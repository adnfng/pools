import type { Metadata } from 'next';
import { preload } from 'react-dom';
import './globals.css';
import { GalleryProvider } from '@/components/gallery-provider';

export const metadata: Metadata = {
  title: 'imsend.ing',
  icons: { icon: '/imsend-ing.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  preload('/fonts/tt-rounds-neue-demibold.ttf', { as: 'font', type: 'font/ttf', crossOrigin: 'anonymous' });
  return (
    <html lang="en">
      <body><GalleryProvider>{children}</GalleryProvider></body>
    </html>
  );
}
