import { notFound } from 'next/navigation';
import type { JsonObject } from '@narraza/application';
import { resolveM4VerticalAccess } from '../../../../../../lib/server/preview/m4-vertical-harness';
import {
  getM4VerticalView,
  M4_VERTICAL_WORKFLOW_KINDS,
  type M4VerticalWorkflowKind,
} from '../../../../../../server/domain/m4-vertical';
import {
  acceptM4ConceptAction,
  sendIntakeMessageAction,
  startM4WorkflowAction,
} from '../../../../../../server/domain/m4-vertical-actions';

export const dynamic = 'force-dynamic';

const STEP_LABELS: Record<M4VerticalWorkflowKind, string> = {
  chat_intake_reply: '1. Balasan intake (dana sistem)',
  concept_generation: '2. Tiga konsep',
  foundation_generation: '4. Proposal foundation',
  outline_generation: '5. Proposal outline 10 bab',
  beat_write_judge: '6. Adegan: writer → judge',
  safe_repair: '7. Safe repair',
  publish_package: '8. Proposal paket publish',
};

const ERROR_MESSAGES: Record<string, string> = {
  not_found: 'Proyek tidak ditemukan.',
  conflict: 'Proses tidak dapat dilanjutkan (konflik). Muat ulang halaman.',
  invalid: 'Permintaan tidak valid.',
  prerequisite: 'Prasyarat langkah ini belum terpenuhi.',
  fair_use_limited: 'Kuota harian intake tercapai.',
  insufficient_credit: 'Saldo kredit belum cukup.',
  stale_plan: 'Rencana berubah sejak penawaran dibuat. Coba lagi.',
  NOT_FOUND: 'Data tidak ditemukan.',
  FOUNDATION_LOCKED: 'Foundation sudah terkunci; konsep tidak dapat diterima.',
  CAS_FAILED: 'Versi kanonik berubah; coba lagi.',
};

function jobStatusText(job: {
  active: { readonly status: string } | null;
  terminal: { readonly status: string } | null;
}): string {
  if (job.active) return job.active.status;
  if (job.terminal) return job.terminal.status;
  return 'belum ada';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function candidateDescription(kind: M4VerticalWorkflowKind, payload: JsonObject): string {
  const output = asRecord(payload['output']);
  if (!output) return 'kandidat (tanpa output)';
  if (kind === 'outline_generation') {
    const proposal = asRecord(output['proposal']);
    const chapters = Array.isArray(proposal?.['chapters']) ? proposal['chapters'] : [];
    return `proposal outline: ${chapters.length} bab`;
  }
  if (kind === 'beat_write_judge') {
    const candidates = Array.isArray(output['candidates']) ? output['candidates'] : [];
    return `${candidates.length} kandidat prosa`;
  }
  if (kind === 'safe_repair') {
    const repaired = asRecord(output['repaired']);
    return `perbaikan: ${repaired ? String(repaired['kind'] ?? 'safe_repair') : 'safe_repair'}`;
  }
  const proposal = asRecord(output['proposal']);
  return proposal ? `proposal: ${String(proposal['kind'] ?? '')}` : 'kandidat';
}

/**
 * M4 dev/mock exit-gate vertical (fail-closed preview surface). One guided
 * utilitarian page over the REAL M4 chain: intake reply → 3 concepts →
 * concept accept → foundation draft → foundation/outline proposals →
 * writer/judge candidates → safe repair → publish artifact proposal. Jobs are
 * executed by the REAL worker processor with the deterministic mock provider.
 */
export default async function M4VerticalHarnessPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { projectId } = await params;
  const access = await resolveM4VerticalAccess(projectId);
  if (access.kind !== 'allowed') notFound();
  const view = await getM4VerticalView(projectId);
  if (!view) notFound();
  const { error: errorKey } = await searchParams;

  const sufficiency = (() => {
    const latest = asRecord(view.intakeSession?.payload['m4LatestResponse']);
    const output = asRecord(latest?.['output']);
    const value = asRecord(output?.['sufficiency']);
    return value
      ? { collected: Number(value['collected'] ?? 0), required: Number(value['required'] ?? 0) }
      : null;
  })();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6 border-b border-border-default pb-4">
        <p className="text-xs font-extrabold tracking-[0.08em] text-text-muted">PERAGA UJI M4</p>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-text-primary sm:text-3xl">
          Vertikal dev/mock M4
        </h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Permukaan khusus lingkungan pengujian: rantai M4 nyata (freeze → plan → quote → job →
          worker → proyeksi) dengan provider mock deterministik. Aktivasi produksi tetap
          fail-closed.
        </p>
        <p className="mt-2 text-sm text-text-secondary" data-testid="m4-credit-available">
          Kredit tersedia: {Number(view.creditSummary.available)}
        </p>
      </header>

      <p
        className="mb-6 rounded border border-border-default bg-surface-muted p-3 text-sm text-text-secondary"
        data-testid="m4-error"
      >
        {errorKey ? (ERROR_MESSAGES[errorKey] ?? 'Terjadi kesalahan.') : 'Semua langkah siap.'}
      </p>

      <section className="mb-8" data-testid="m4-step-intake">
        <h2 className="text-lg font-semibold text-text-primary">Intake dan kecukupan sinyal</h2>
        <ol className="mt-3 space-y-2" data-testid="m4-intake-thread">
          {view.intakeMessages.map((message) => (
            <li
              key={message.id}
              data-testid={message.role === 'assistant' ? 'm4-intake-reply' : 'm4-intake-user'}
              className="rounded border border-border-default p-2 text-sm"
            >
              <span className="font-semibold">{message.role === 'user' ? 'Kamu' : 'Asisten'}:</span>{' '}
              {message.content}
            </li>
          ))}
        </ol>
        {sufficiency ? (
          <p className="mt-2 text-sm text-text-secondary" data-testid="m4-sufficiency">
            Kecukupan sinyal: {sufficiency.collected}/{sufficiency.required}
          </p>
        ) : null}
        <form
          action={sendIntakeMessageAction}
          className="mt-3 flex flex-col gap-2"
          data-testid="m4-intake-form"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <textarea
            name="content"
            required
            rows={2}
            placeholder="Tulis premis ceritamu…"
            data-testid="m4-intake-input"
          />
          <button
            type="submit"
            className="w-fit rounded bg-text-primary px-3 py-1.5 text-sm font-semibold text-surface"
          >
            Kirim dan minta balasan
          </button>
        </form>
        <p className="mt-2 text-sm text-text-secondary" data-testid="m4-job-chat_intake_reply">
          Status job intake: {jobStatusText(view.jobs.chat_intake_reply)}
        </p>
      </section>

      <section className="mb-8" data-testid="m4-step-concepts">
        <h2 className="text-lg font-semibold text-text-primary">Konsep</h2>
        <p className="mt-1 text-sm text-text-secondary" data-testid="m4-job-concept_generation">
          Status job konsep: {jobStatusText(view.jobs.concept_generation)}
        </p>
        <form action={startM4WorkflowAction} className="mt-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="workflowKind" value="concept_generation" />
          <button
            type="submit"
            data-testid="m4-start-concept_generation"
            className="w-fit rounded border border-border-default px-3 py-1.5 text-sm"
          >
            Jalankan concept_generation
          </button>
        </form>
        <ul className="mt-3 space-y-2">
          {(view.conceptSet?.concepts ?? []).map((concept) => (
            <li
              key={concept.id}
              className="rounded border border-border-default p-2 text-sm"
              data-testid="m4-concept-item"
            >
              <span className="font-semibold">{concept.title}</span> — {concept.synopsis}
              <form action={acceptM4ConceptAction} className="mt-1">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="conceptId" value={concept.id} />
                <button
                  type="submit"
                  data-testid="m4-accept-concept"
                  className="rounded border border-border-default px-2 py-1 text-xs"
                >
                  Pilih konsep ini
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8" data-testid="m4-foundation-section">
        <h2 className="text-lg font-semibold text-text-primary">Draft foundation</h2>
        {view.foundation ? (
          <p className="mt-2 text-sm text-text-secondary" data-testid="m4-foundation-draft">
            Status: {view.foundation.status}; konsep inti:{' '}
            {String(view.foundation.payload['coreConcept'] ?? '(kosong)')}
          </p>
        ) : (
          <p className="mt-2 text-sm text-text-secondary">Belum ada draft foundation.</p>
        )}
      </section>

      {(
        ['foundation_generation', 'outline_generation', 'beat_write_judge', 'safe_repair'] as const
      ).map((kind) => {
        const group = view.candidateGroups[kind];
        return (
          <section className="mb-8" key={kind} data-testid={`m4-step-${kind}`}>
            <h2 className="text-lg font-semibold text-text-primary">{STEP_LABELS[kind]}</h2>
            <p className="mt-1 text-sm text-text-secondary" data-testid={`m4-job-${kind}`}>
              Status job: {jobStatusText(view.jobs[kind])}
            </p>
            <form action={startM4WorkflowAction} className="mt-2">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="workflowKind" value={kind} />
              <button
                type="submit"
                data-testid={`m4-start-${kind}`}
                className="w-fit rounded border border-border-default px-3 py-1.5 text-sm"
              >
                Jalankan {kind}
              </button>
            </form>
            {group ? (
              <ul className="mt-3 space-y-2" data-testid={`m4-candidates-${kind}`}>
                {group.candidates.map((candidate) => (
                  <li
                    key={candidate.id}
                    className="rounded border border-border-default p-2 text-sm"
                  >
                    {kind === 'outline_generation' ? (
                      <span data-testid="m4-outline-chapters">
                        {candidateDescription(kind, candidate.payload)}
                      </span>
                    ) : kind === 'beat_write_judge' ? (
                      <span data-testid="m4-writer-candidate">
                        {(() => {
                          // The projection stores ONE writer candidate per row:
                          // payload.output is the candidate object itself.
                          const output = asRecord(candidate.payload['output']);
                          return String(output?.['text'] ?? 'kandidat kosong');
                        })()}
                      </span>
                    ) : (
                      candidateDescription(kind, candidate.payload)
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}

      <section className="mb-8" data-testid="m4-step-publish_package">
        <h2 className="text-lg font-semibold text-text-primary">{STEP_LABELS.publish_package}</h2>
        <p className="mt-1 text-sm text-text-secondary" data-testid="m4-job-publish_package">
          Status job: {jobStatusText(view.jobs.publish_package)}
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          Prosa tersedia: {view.proseVersion ? view.proseVersion.id : 'belum ada'}
        </p>
        <form action={startM4WorkflowAction} className="mt-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="workflowKind" value="publish_package" />
          <button
            type="submit"
            data-testid="m4-start-publish_package"
            className="w-fit rounded border border-border-default px-3 py-1.5 text-sm"
          >
            Jalankan publish_package
          </button>
        </form>
        {view.artifactProposal ? (
          <p
            className="mt-3 rounded border border-border-default p-2 text-sm"
            data-testid="m4-artifact-proposal"
          >
            Proposal artefak: {view.artifactProposal.status} (prosa{' '}
            {view.artifactProposal.proseVersionId})
          </p>
        ) : null}
      </section>

      <footer className="mt-10 border-t border-border-default pt-4 text-xs text-text-muted">
        Langkah vertikal: {M4_VERTICAL_WORKFLOW_KINDS.join(' → ')}
      </footer>
    </main>
  );
}
