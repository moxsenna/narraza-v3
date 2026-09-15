'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 150000;

/**
 * Live tail for the intake thread. While the newest message is user-sent the
 * worker may still be producing the reply, so refresh the server tree until
 * it lands. Remount per message (parent keys by message id): each new user
 * message restarts the window, and navigation unmounts the poller entirely.
 */
export function ChatAwaitingPoller() {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        window.clearInterval(id);
        setTimedOut(true);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [router]);

  if (timedOut) {
    return (
      <p data-testid="chat-awaiting-timeout" className="text-sm text-secondary">
        Belum ada balasan — muat ulang halaman atau kirim ulang pesan.
      </p>
    );
  }
  return (
    <p data-testid="chat-awaiting" aria-live="polite" className="text-sm text-secondary">
      Narra sedang membalas…
    </p>
  );
}
