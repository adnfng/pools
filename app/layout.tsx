import type { Metadata } from 'next';
import './globals.css';
import { GalleryProvider } from '@/components/gallery-provider';

export const metadata: Metadata = {
  title: 'imsend.ing',
  icons: { icon: '/imsend-ing.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><GalleryProvider>{children}</GalleryProvider></body>
    </html>
  );
}
