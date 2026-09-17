'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import {
  seedDraftFromCandidateAction,
  type DraftSeedState,
} from '../../server/domain/draft-actions';
import { Button } from '../primitives';

function PickSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending} className="w-full">
      {pending ? 'Menerapkan…' : label}
    </Button>
  );
}

export function CandidatePicker({
  projectId,
  chapterId,
  beatIdsJson,
  acceptedBeatIdsJson,
  candidates,
}: {
  projectId: string;
  chapterId: string;
  beatIdsJson: string;
  acceptedBeatIdsJson: string;
  candidates: readonly { id: string; ordinal: number; text: string }[];
}) {
  const [state, pickAction] = useActionState<DraftSeedState | null, FormData>(
    seedDraftFromCandidateAction,
    null,
  );

  if (candidates.length === 0) {
    return (
      <p className="text-xs text-text-muted">
        Belum ada kandidat untuk bab ini. Buat adegan di atas untuk menghasilkan kandidat.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {state?.kind === 'seeded' && (
        <p
          role="status"
          className="rounded-xl bg-status-success-soft p-3 text-sm font-semibold text-status-success"
        >
          Kandidat diterapkan ke draft. Gulir ke editor untuk menyunting.
        </p>
      )}
      {state && state.kind !== 'seeded' && (
        <p
          role="alert"
          className="rounded-xl bg-status-warning-soft p-3 text-sm font-semibold text-status-warning"
        >
          {state.message}
        </p>
      )}
      {candidates.map((candidate) => (
        <div key={candidate.id} className="rounded-xl border border-border-default bg-surface p-3">
          <p className="text-xs font-bold text-text-primary">Kandidat {candidate.ordinal}</p>
          <p className="font-editor mt-1 line-clamp-4 text-sm leading-6 text-text-secondary">
            {candidate.text}
          </p>
          <form action={pickAction} className="mt-2">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="chapterId" value={chapterId} />
            <input type="hidden" name="candidateId" value={candidate.id} />
            <input type="hidden" name="beatIds" value={beatIdsJson} />
            <input type="hidden" name="acceptedBeatIds" value={acceptedBeatIdsJson} />
            <PickSubmitButton label={`Terapkan kandidat ${candidate.ordinal} ke draft`} />
          </form>
        </div>
      ))}
    </div>
  );
}
