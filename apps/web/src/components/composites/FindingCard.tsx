import { Badge, Card } from '../primitives';

export type FindingSeverity = 'blocking' | 'warning' | 'info';

const severityMeta: Record<
  FindingSeverity,
  { tone: 'danger' | 'warning' | 'info'; label: string }
> = {
  blocking: { tone: 'danger', label: 'Perlu diperbaiki' },
  warning: { tone: 'warning', label: 'Perlu perhatian' },
  info: { tone: 'info', label: 'Catatan' },
};

/**
 * Kartu hasil pemeriksaan (design.md §15.8): berbahasa manfaat, detail teknis
 * hanya muncul di balik "Lihat alasan" (native details, tanpa JS).
 * `message` wajib berasal dari publicMessageCode — tidak pernah memuat
 * restrictedDetail / source internal.
 */
export function FindingCard({
  severity,
  message,
  reason,
  className = '',
}: {
  severity: FindingSeverity;
  message: string;
  reason?: string | undefined;
  className?: string;
}) {
  const meta = severityMeta[severity];
  return (
    <Card className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>
      <p className="mt-2 text-sm font-semibold leading-6 text-primary">{message}</p>
      {reason ? (
        <details className="mt-2 text-sm leading-6 text-secondary">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-brand-strong">
            Lihat alasan
          </summary>
          <p className="mt-1">{reason}</p>
        </details>
      ) : null}
    </Card>
  );
}
