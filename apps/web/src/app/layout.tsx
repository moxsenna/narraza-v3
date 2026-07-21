import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { APP_MESSAGES_ID } from '../messages/app-id';
import './globals.css';

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
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
