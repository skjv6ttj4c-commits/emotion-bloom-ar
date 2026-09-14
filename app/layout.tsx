import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import {
  FACE_MODEL_PATH,
  VISION_WASM_BINARY_PATH,
  VISION_WASM_LOADER_PATH,
} from '@/face/face-assets';
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
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href={FACE_MODEL_PATH}
          as="fetch"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href={VISION_WASM_BINARY_PATH}
          as="fetch"
          type="application/wasm"
          crossOrigin="anonymous"
        />
        <link rel="preload" href={VISION_WASM_LOADER_PATH} as="script" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
