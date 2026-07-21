/**
 * Minimal id-ID copy for auth message codes (M0 stopgap). The real i18n catalog
 * — copy lifted from the prototype into message codes — is built in M6. Keeping
 * this map means the UI never renders a raw internal code (no-internal-strings).
 */
export const AUTH_MESSAGES_ID: Record<string, string> = {
  'msg.auth.error.invalid_input': 'Periksa lagi alamat emailmu, ya.',
  'msg.auth.error.weak_password':
    'Kata sandi belum memenuhi syarat. Gunakan minimal 10 karakter dan hindari yang mudah ditebak.',
  'msg.auth.error.invalid_credentials': 'Email atau kata sandi salah.',
  'msg.auth.error.email_not_verified':
    'Emailmu belum diverifikasi. Cek kotak masukmu, atau kirim ulang tautan verifikasi.',
  'msg.auth.error.invalid_token':
    'Tautan sudah tidak berlaku atau sudah dipakai. Minta yang baru, ya.',
  'msg.auth.error.rate_limited': 'Terlalu banyak percobaan. Coba lagi sebentar lagi.',
  'msg.auth.error.account_locked':
    'Akun dikunci sementara karena terlalu banyak percobaan gagal. Coba lagi nanti.',
};

export function authMessage(code: string): string {
  return AUTH_MESSAGES_ID[code] ?? 'Terjadi kesalahan. Coba lagi.';
}
