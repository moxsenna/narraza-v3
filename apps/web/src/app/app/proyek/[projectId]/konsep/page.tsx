import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ConceptGenerationPanel } from '../../../../../components/credits/ConceptGenerationPanel';
import { PageHeader } from '../../../../../components/composites/PageHeader';
import { Badge, Button, Card } from '../../../../../components/primitives';
import { chooseConceptAction } from '../../../../../server/domain/concept-generation-actions';
import {
  assertConceptProjectAccess,
  findConceptJobState,
  getConceptSetView,
} from '../../../../../server/domain/concept-generation';
import { getMyProject, getProjectFoundation } from '../../../../../server/domain/queries';

export default async function KonsepPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();

  const access = await assertConceptProjectAccess(projectId);
  if (access.kind !== 'allowed') notFound();

  const [jobLookup, conceptSet, foundation] = await Promise.all([
    findConceptJobState(projectId, null),
    getConceptSetView(projectId),
    getProjectFoundation(projectId),
  ]);

  const jobRef = jobLookup.kind === 'found' ? jobLookup.jobRef : null;
  const job = jobLookup.kind === 'found' ? jobLookup.view : null;
  const concepts = conceptSet?.concepts ?? [];
  const foundationDraft = foundation?.status === 'draft';

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <PageHeader
        eyebrow="PERSIAPAN"
        title="Pilih Konsep Cerita"
        description="Narra menyusun tiga arah cerita dari sinyal chat. Pilih satu untuk menjadi fondasi draft."
      />

      {foundationDraft && (
        <div className="mt-6 rounded-2xl border border-active bg-brand-soft p-4 sm:p-5">
          <p className="text-sm font-bold text-primary">
            Fondasi masih draft — pilihan konsepmu sudah tersimpan.
          </p>
          <p className="mt-1 text-sm leading-6 text-secondary">
            Lanjutkan menyunting fondasi, lalu kunci ketika siap menjadi acuan resmi.
          </p>
          <Link
            href={`/app/proyek/${projectId}/fondasi`}
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-5 text-sm font-bold text-white shadow-xs hover:bg-brand-700"
          >
            Buka Fondasi →
          </Link>
        </div>
      )}

      <div className="mt-8">
        <ConceptGenerationPanel projectId={projectId} initialJobRef={jobRef} initialJob={job} />
      </div>

      {concepts.length > 0 && (
        <section className="mt-8" aria-labelledby="concept-directions-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="concept-directions-title" className="text-xl font-bold text-primary">
                Tiga arah cerita
              </h2>
              <p className="mt-1 text-sm leading-6 text-secondary">
                Setiap kartu memuat premis dan konflik utama. Pilih satu — fondasi draft dibuat
                tanpa mengunci apa pun.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {concepts.map((concept, index) => (
              <Card key={concept.id} className="flex min-h-64 flex-col">
                <div className="flex items-center justify-between gap-3">
                  <Badge tone="brand">Pilihan {index + 1}</Badge>
                </div>
                <h3 className="mt-5 text-lg font-bold text-primary">{concept.title}</h3>
                <p className="mt-3 text-sm leading-6 text-secondary">{concept.synopsis}</p>
                <div className="mt-auto pt-6">
                  <form action={chooseConceptAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="conceptId" value={concept.id} />
                    <Button className="w-full" type="submit">
                      Pilih konsep ini
                    </Button>
                  </form>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    Memilih membuat fondasi draft. Fondasi tidak terkunci otomatis.
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
