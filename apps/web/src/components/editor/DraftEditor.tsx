'use client';

import { useEffect, useRef, useState } from 'react';

import { saveWorkingDraftAction } from '../../server/domain/draft-actions';

/**
 * Working-draft editor with debounced CAS autosave. The server owns the
 * revision; a conflict surfaces a banner instead of silently overwriting.
 */
export function DraftEditor({
  projectId,
  chapterId,
  beatId,
  beatTitle,
  initialContent,
  initialRevision,
}: {
  projectId: string;
  chapterId: string;
  beatId: string;
  beatTitle: string;
  initialContent: string;
  initialRevision: number;
}) {
  const [content, setContent] = useState(initialContent);
  const [revision, setRevision] = useState(initialRevision);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(content);
  latest.current = content;

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const scheduleSave = (next: string) => {
    setContent(next);
    setError(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const result = await saveWorkingDraftAction(
          projectId,
          chapterId,
          beatId,
          latest.current,
          revision,
        );
        if (result.kind === 'saved') {
          setRevision(result.revision);
          setConflict(null);
        } else {
          setConflict(result.message);
        }
      } catch {
        setError('Penyimpanan otomatis gagal. Periksa koneksi lalu ubah lagi untuk mencoba.');
      } finally {
        setSaving(false);
      }
    }, 1500);
  };

  return (
    <div>
      <label htmlFor="prose-editor" className="block text-sm font-semibold text-text-primary">
        Naskah {beatTitle}
      </label>
      <p className="mt-1 text-xs text-text-muted" aria-live="polite">
        {saving
          ? 'Menyimpan…'
          : conflict
            ? 'Konflik simpanan'
            : `Tersimpan otomatis · revisi ${revision}`}
      </p>
      {conflict && (
        <p
          role="alert"
          className="mt-2 rounded-xl bg-status-warning-soft p-3 text-sm font-semibold text-status-warning"
        >
          {conflict}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-2 rounded-xl bg-status-danger-soft p-3 text-sm font-semibold text-status-danger"
        >
          {error}
        </p>
      )}
      <textarea
        id="prose-editor"
        name="prose"
        rows={12}
        value={content}
        onChange={(event) => scheduleSave(event.target.value)}
        placeholder="Tulis naskah adegan di sini…"
        className="font-editor mt-2 w-full resize-none rounded-xl border border-border-default bg-surface p-4 text-base leading-[1.85] text-text-primary placeholder:text-text-muted focus:border-active focus:outline-none focus:ring-2 focus:ring-active"
      />
    </div>
  );
}
