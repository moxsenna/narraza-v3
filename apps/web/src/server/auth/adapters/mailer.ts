import nodemailer from 'nodemailer';
import type { Mailer } from '@narraza/application';

/**
 * Email transport (D10/D21). Dev/CI use SMTP → Mailpit (e2e reads links from
 * Mailpit's API). Production uses Resend's HTTP API. Copy is plain and minimal
 * for M0; branded templates land in M7. User-facing strings move to message
 * codes in M6 — kept inline here so M0 auth is runnable.
 */
export interface MailerConfig {
  from: string;
  smtpUrl?: string | undefined;
  resendApiKey?: string | undefined;
}

const VERIFY = {
  subject: 'Verifikasi email Narraza-mu',
  text: (url: string) =>
    `Selamat datang di Narraza.\n\nKlik tautan ini untuk memverifikasi emailmu dan mulai:\n${url}\n\nTautan berlaku terbatas. Jika kamu tidak mendaftar, abaikan email ini.`,
};
const RESET = {
  subject: 'Atur ulang kata sandi Narraza',
  text: (url: string) =>
    `Ada permintaan untuk mengatur ulang kata sandimu.\n\nKlik tautan ini untuk membuat kata sandi baru:\n${url}\n\nTautan berlaku terbatas. Jika ini bukan kamu, abaikan email ini — kata sandimu tidak berubah.`,
};
const EXISTS = {
  subject: 'Kamu sudah punya akun Narraza',
  text: () =>
    `Seseorang mencoba mendaftar dengan email ini, tetapi kamu sudah punya akun Narraza.\n\nSilakan masuk seperti biasa. Jika kamu lupa kata sandi, gunakan tautan "Lupa kata sandi" di halaman masuk.`,
};

export function createMailer(config: MailerConfig): Mailer {
  async function send(to: string, subject: string, text: string): Promise<void> {
    if (config.smtpUrl) {
      const transport = nodemailer.createTransport(config.smtpUrl);
      await transport.sendMail({ from: config.from, to, subject, text });
      return;
    }
    if (config.resendApiKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: config.from, to, subject, text }),
      });
      if (!res.ok) {
        throw new Error(`Resend send failed: ${res.status}`);
      }
      return;
    }
    throw new Error('Mailer misconfigured: no SMTP_URL or RESEND_API_KEY');
  }

  return {
    async sendVerifyEmail({ to, url }) {
      await send(to, VERIFY.subject, VERIFY.text(url));
    },
    async sendPasswordReset({ to, url }) {
      await send(to, RESET.subject, RESET.text(url));
    },
    async sendAccountExistsNotice({ to }) {
      await send(to, EXISTS.subject, EXISTS.text());
    },
  };
}
