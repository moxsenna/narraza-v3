'use client';

import { Chip } from '../primitives';

/**
 * Rekomendasi cepat (design.md §15.6): maksimal 3–5 pilihan per giliran,
 * target sentuh ≥44px (min-h-11). Client component: halaman chat (sudah
 * client) meneruskan `onSelect` untuk mengisi draf atau langsung mengirim.
 */
export function QuickReplies({
  options,
  onSelect,
  disabled = false,
  label = 'Saran cepat',
  className = '',
}: {
  options: readonly string[];
  onSelect: (value: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const shown = options.slice(0, 5);
  if (shown.length === 0) return null;
  return (
    <div aria-label={label} className={`flex flex-wrap gap-2 ${className}`}>
      {shown.map((option) => (
        <Chip key={option} selected={false} disabled={disabled} onClick={() => onSelect(option)}>
          {option}
        </Chip>
      ))}
    </div>
  );
}
