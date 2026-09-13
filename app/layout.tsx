import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Pixel Live · Expression Studio',
  description: 'A browser-based, on-device expression effects experience.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href={`${publicBasePath}/mediapipe/models/face_landmarker.task`}
          as="fetch"
          crossOrigin="anonymous"
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
