import { notFound } from 'next/navigation';
import { EditorView } from '../../../components/editor/EditorView';
import { TopNav } from '../../../components/nav/TopNav';

export const dynamic = 'force-dynamic';

export default function StudioPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav
        account={{ initial: 'B', email: 'penulis@narraza.com' }}
        currentProject={{
          id: 'preview-project',
          title: 'Serpihan Janji',
          meta: 'Arc 1 (Bab 3/60)',
        }}
        credit={{
          availableCredits: 1250,
          heldCredits: 0,
          reconcilingCredits: 0,
          lowBalance: false,
        }}
        continuityScore={100}
      />
      <div className="flex-1">
        <EditorView
          projectTitle="Serpihan Janji"
          chapterTitle="Kotak di Gudang"
          chapterOrdinal={3}
        />
      </div>
    </div>
  );
}
