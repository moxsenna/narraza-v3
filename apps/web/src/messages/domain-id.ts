/**
 * Minimal id-ID copy for domain message codes (M6 hardening). Same contract
 * as AUTH_MESSAGES_ID: the UI never renders a raw internal code
 * (no-internal-strings) — unknown codes fall back to a generic message.
 */
export const DOMAIN_MESSAGES_ID: Record<string, string> = {
  // --- umum ---
  'msg.error.not_found': 'Data tidak ditemukan. Muat ulang halaman.',
  // --- proyek ---
  'msg.project.create_failed': 'Proyek belum bisa dibuat. Coba lagi.',
  'msg.project.jalur_invalid': 'Jalur mulai tidak dikenal. Pilih ulang.',
  'msg.project.jalur_draft_disabled': 'Jalur draft segera hadir dan belum bisa dipilih.',
  'msg.project.not_found': 'Proyek tidak ditemukan.',
  // --- intake/chat ---
  'msg.intake.append_failed': 'Pesan belum terkirim. Coba lagi.',
  'msg.intake.empty_message': 'Tulis pesan dulu sebelum mengirim.',
  'msg.intake.message_too_long': 'Pesan terlalu panjang. Ringkas dulu, ya.',
  'msg.intake.session_not_found': 'Sesi obrolan tidak ditemukan. Muat ulang halaman.',
  // --- fondasi ---
  'msg.foundation.not_found': 'Fondasi belum tersedia.',
  'msg.foundation.not_draft': 'Fondasi sudah tidak dalam status draft.',
  'msg.foundation.locked': 'Fondasi sudah dikunci.',
  'msg.foundation.update_failed': 'Draft fondasi belum tersimpan. Coba lagi.',
  'msg.foundation.must_confirm_first': 'Konfirmasi fondasi dulu sebelum mengunci.',
  'msg.foundation.confirm_failed': 'Konfirmasi fondasi belum berhasil. Coba lagi.',
  'msg.foundation.not_ready': 'Fondasi belum siap dikunci. Lengkapi daftarnya dulu.',
  'msg.foundation.lock_not_acknowledged': 'Centang persetujuan dulu sebelum mengunci.',
  'msg.foundation.lock_failed': 'Fondasi belum terkunci. Coba lagi.',
  'msg.foundation.cas_failed': 'Fondasi berubah di perangkat lain. Muat ulang lalu coba lagi.',
  // --- outline/rencana bab ---
  'msg.outline.not_found': 'Bagian rencana tidak ditemukan.',
  'msg.outline.parent_required': 'Pilih induknya dulu sebelum menambah.',
  'msg.outline.parent_not_found': 'Induk yang dipilih tidak ditemukan.',
  'msg.outline.title_required': 'Isi judul dulu sebelum menambah.',
  'msg.outline.beat_not_found': 'Adegan tidak ditemukan.',
  'msg.outline.foundation_not_locked':
    'Kunci fondasi dulu sebelum menyusun rencana bab. Lengkapi fondasi, konfirmasi, lalu kunci.',
  'msg.outline.downstream_locked':
    'Bagian ini sudah memiliki tulisan resmi dan tidak bisa diubah langsung.',
  // --- karakter ---
  'msg.character.fields_required': 'Lengkapi kolom karakter yang wajib diisi.',
  'msg.character.not_found': 'Karakter tidak ditemukan.',
  // --- fakta ---
  'msg.fact.fields_required': 'Lengkapi kolom fakta yang wajib diisi.',
  'msg.fact.not_found': 'Fakta tidak ditemukan.',
  'msg.fact.canon_status_invalid': 'Status fakta tidak dikenal.',
  'msg.fact.visibility_invalid': 'Visibilitas fakta tidak dikenal.',
  // --- rahasia/reveal ---
  'msg.reveal.fields_required': 'Lengkapi kolom rahasia yang wajib diisi.',
  'msg.reveal.not_found': 'Rahasia tidak ditemukan.',
  // --- konsep ---
  'msg.concept.not_found': 'Konsep tidak ditemukan.',
  'msg.concept.accept_bad_state': 'Konsep sudah tidak bisa dipilih.',
  'msg.concept.accept_failed': 'Konsep belum bisa dipakai. Coba lagi.',
  // --- usulan/proposal ---
  'msg.proposal.not_found': 'Usulan tidak ditemukan.',
  'msg.proposal.not_pending': 'Usulan sudah tidak menunggu keputusan.',
  'msg.proposal.group_not_found': 'Kelompok usulan tidak ditemukan.',
  'msg.proposal.stale': 'Usulan sudah kedaluwarsa. Muat ulang halaman.',
  'msg.proposal.superseded': 'Usulan sudah digantikan keputusan lain.',
  'msg.proposal.needs_revalidation': 'Usulan perlu ditinjau ulang dulu.',
  'msg.proposal.resolve_failed': 'Usulan belum bisa diproses. Coba lagi.',
  'msg.proposal.content_required': 'Isi usulan tidak boleh kosong.',
  'msg.proposal.candidate_required': 'Pilih kandidat tulisan dulu.',
  'msg.proposal.candidate_empty': 'Kandidat tulisan masih kosong.',
  'msg.proposal.candidate_not_found': 'Kandidat tulisan tidak ditemukan.',
  'msg.proposal.operations_hash_mismatch': 'Usulan berubah di tengah jalan. Muat ulang halaman.',
  'msg.proposal.accept_not_last': 'Urutan penerimaan usulan tidak valid.',
  // --- change set ---
  'msg.changeset.empty': 'Tidak ada perubahan untuk diterapkan.',
  'msg.changeset.unknown': 'Perubahan tidak dikenal.',
  'msg.changeset.not_pending': 'Perubahan sudah tidak menunggu.',
  'msg.changeset.cas_failed': 'Data berubah di perangkat lain. Muat ulang lalu coba lagi.',
  'msg.changeset.apply_failed': 'Perubahan belum bisa diterapkan. Coba lagi.',
  'msg.changeset.unsupported_op': 'Jenis perubahan ini belum didukung.',
  'msg.changeset.unknown_op': 'Jenis perubahan tidak dikenal.',
  'msg.changeset.foundation_missing': 'Fondasi belum tersedia.',
  'msg.changeset.character_fields': 'Kolom karakter belum lengkap.',
  'msg.changeset.fact_fields': 'Kolom fakta belum lengkap.',
  'msg.changeset.outline_node': 'Rencana bab belum valid.',
  'msg.changeset.reveal_refs': 'Referensi rahasia belum valid.',
  'msg.changeset.breadcrumb_fields': 'Kolom petunjuk belum lengkap.',
  'msg.changeset.prose_fields': 'Kolom tulisan belum lengkap.',
  'msg.changeset.prose_mismatch': 'Tulisan tidak cocok dengan adegan.',
  'msg.changeset.prose_beat_mismatch': 'Tulisan tidak cocok dengan adegan yang dipilih.',
  // --- naskah/prose ---
  'msg.prose.draft_not_found': 'Draft tulisan tidak ditemukan.',
  'msg.prose.version_not_found': 'Versi tulisan tidak ditemukan.',
  'msg.prose.draft_conflict': 'Draft berubah di perangkat lain. Muat ulang lalu coba lagi.',
  'msg.prose.unsupported': 'Operasi tulisan ini belum didukung.',
  // --- validasi/perbaikan ---
  'msg.validation.report_not_found': 'Laporan pemeriksaan tidak ditemukan.',
  'msg.validation.stale': 'Hasil pemeriksaan sudah kedaluwarsa. Jalankan ulang.',
  'msg.validation.finding_not_found': 'Temuan tidak ditemukan.',
  'msg.validation.nothing_to_repair': 'Tidak ada yang perlu diperbaiki.',
  'msg.validation.override_not_allowed': 'Temuan ini tidak bisa dikecualikan.',
  'msg.validation.override_decided': 'Pengecualian sudah diputuskan.',
  'msg.validation.override_reason_required': 'Tulis alasan pengecualian dulu.',
  // --- paket publish ---
  'msg.artifact.not_found': 'Paket tidak ditemukan.',
  'msg.artifact.not_pending': 'Paket sudah tidak menunggu.',
  'msg.artifact.prose_not_accepted': 'Masih ada tulisan yang belum resmi.',
  // --- auth generik (dipakai di luar auth-id) ---
  'msg.auth.unauthorized': 'Sesi berakhir. Masuk lagi, ya.',
  'msg.auth.forbidden': 'Kamu tidak punya akses ke sini.',
};

export function domainMessage(code: string): string {
  return DOMAIN_MESSAGES_ID[code] ?? 'Terjadi kesalahan. Coba lagi.';
}
