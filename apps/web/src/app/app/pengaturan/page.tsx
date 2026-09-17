import { CapabilityNotice } from '../../../components/composites/CapabilityNotice';
import { GlobalAppShell } from '../../../components/composites/GlobalAppShell';
import { PageHeader } from '../../../components/composites/PageHeader';
import { Badge, Button, Card } from '../../../components/primitives';
import { CAPABILITIES } from '../../../lib/frontend/capabilities';
import { getCurrentUser } from '../../../server/auth/session';
import { setUiModeAction } from '../../../server/settings/ui-mode';

export default async function PengaturanPage() {
  const user = await getCurrentUser();
  const capability = CAPABILITIES['app.settings.view'];

  return (
    <GlobalAppShell>
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <PageHeader
          eyebrow="AKUN"
          title="Pengaturan"
          description="Tinjau profil dan pilihan pengalaman menulis. Perubahan belum dapat disimpan dari halaman ini."
        />
        <div className="mt-6">
          <CapabilityNotice
            notice={{ capabilityKey: capability.key, reasonCode: 'BACKEND_NOT_AVAILABLE' }}
          />
        </div>

        <div className="mt-8 space-y-5">
          <Card>
            <h2 className="text-lg font-bold text-primary">Profil</h2>
            <p className="mt-2 text-sm leading-6 text-secondary">
              Alamat email akun yang sedang digunakan.
            </p>
            <div className="mt-4 rounded-md border border-default bg-surface-soft p-4 text-sm font-semibold text-primary">
              {user?.email ?? 'Informasi profil belum tersedia'}
            </div>
            <Button className="mt-4" variant="secondary" disabled>
              Ubah profil
            </Button>
            <p className="mt-2 text-xs leading-5 text-muted">Perubahan profil belum tersedia.</p>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-primary">Cara menggunakan Narraza</h2>
                <p className="mt-1 text-sm leading-6 text-secondary">
                  Pemula memberi panduan lebih ringkas. Mahir membuka penjelasan lebih rinci.
                </p>
              </div>
              <Badge tone={user?.uiMode === 'mahir' ? 'brand' : 'neutral'}>
                {user?.uiMode === 'mahir' ? 'Mahir aktif' : 'Pemula aktif'}
              </Badge>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    mode: 'pemula',
                    title: 'Pemula',
                    copy: 'Langkah terarah dan bahasa sederhana.',
                  },
                  {
                    mode: 'mahir',
                    title: 'Mahir',
                    copy: 'Kontrol dan detail cerita lebih dalam.',
                  },
                ] as const
              ).map((option) => {
                const selected = user?.uiMode === option.mode;
                return (
                  <form key={option.mode} action={setUiModeAction}>
                    <input type="hidden" name="mode" value={option.mode} />
                    <button
                      type="submit"
                      aria-pressed={selected}
                      className={`min-h-20 w-full rounded-lg border p-4 text-left ${
                        selected
                          ? 'border-active bg-brand-soft'
                          : 'border-default bg-surface-soft hover:border-active'
                      }`}
                    >
                      <span className="block font-bold text-primary">
                        {option.title}
                        {selected ? ' ✓' : ''}
                      </span>
                      <span className="mt-1 block text-sm leading-5 text-secondary">
                        {option.copy}
                      </span>
                    </button>
                  </form>
                );
              })}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-bold text-primary">Kualitas bantuan menulis</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {['Hemat', 'Seimbang', 'Terbaik'].map((tier) => (
                <button
                  key={tier}
                  type="button"
                  disabled
                  className="min-h-11 rounded-pill border border-default bg-surface-soft px-4 text-sm font-semibold text-secondary disabled:cursor-not-allowed"
                >
                  {tier}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">
              Pilihan kualitas belum dapat diubah.
            </p>
          </Card>

          <Card>
            <h2 className="text-lg font-bold text-primary">Keamanan dan data</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="secondary" disabled>
                Keluar dari semua perangkat
              </Button>
              <Button variant="secondary" disabled>
                Unduh data
              </Button>
              <Button variant="destructive" disabled>
                Hapus akun
              </Button>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">
              Tindakan ini belum tersedia dan tidak akan mengubah akunmu.
            </p>
          </Card>
        </div>
      </main>
    </GlobalAppShell>
  );
}
