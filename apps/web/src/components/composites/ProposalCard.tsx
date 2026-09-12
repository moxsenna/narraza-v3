import type { ReactNode } from 'react';

import { Badge, Card } from '../primitives';

export type ProposalRisk = 'low' | 'high';

const riskBadge: Record<ProposalRisk, { tone: 'success' | 'warning'; label: string }> = {
  low: { tone: 'success', label: 'Risiko rendah' },
  high: { tone: 'warning', label: 'Perlu kamu periksa' },
};

/**
 * Kartu "Usulan Narra" (design.md §15.7). Usulan selalu tampil berbeda dari
 * fakta canon: berlabel eksplisit, berisi dampak singkat, dan tindakan
 * Terima / Ubah / Tolak disuplai halaman lewat slot `actions` (Server Action
 * form) agar komponen ini tetap server-safe.
 */
export function ProposalCard({
  title,
  summary,
  impact,
  risk = 'low',
  actions,
  className = '',
}: {
  title: string;
  summary: string;
  impact?: string | undefined;
  risk?: ProposalRisk | undefined;
  actions?: ReactNode;
  className?: string;
}) {
  const badge = riskBadge[risk];
  return (
    <Card className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">Usulan Narra</Badge>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      <h3 className="mt-3 text-lg font-bold text-primary">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-secondary">{summary}</p>
      {impact ? (
        <p className="mt-3 rounded-md bg-surface-soft p-3 text-sm leading-6 text-secondary">
          <span className="font-bold text-primary">Dampak: </span>
          {impact}
        </p>
      ) : null}
      {risk === 'high' ? (
        <p role="note" className="mt-3 text-sm font-semibold leading-6 text-status-warning">
          Perubahan besar — baca dengan teliti sebelum menerima. Tidak ada yang otomatis menjadi
          resmi.
        </p>
      ) : null}
      {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </Card>
  );
}
