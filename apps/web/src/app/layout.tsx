import type { Metadata } from 'next';
import { Lora, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { APP_MESSAGES_ID } from '../messages/app-id';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta-sans',
  weight: 'variable',
  display: 'swap',
});
const lora = Lora({
  subsets: ['latin'],
  variable: '--font-lora',
  weight: 'variable',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: APP_MESSAGES_ID.metadata.title,
    template: APP_MESSAGES_ID.metadata.titleTemplate,
  },
  description: APP_MESSAGES_ID.metadata.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className={`${plusJakartaSans.variable} ${lora.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
