import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getMyProject,
  getProjectIntakeMessages,
} from '../../../../../server/domain/queries';
import { ChatForm } from './chat-form';

export default async function ChatPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();
  const messages = await getProjectIntakeMessages(projectId);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col px-4 py-8 sm:px-6">
      <Link href={`/app/proyek/${projectId}`} className="text-sm font-semibold text-brand-700">
        ← {project.title}
      </Link>
      <h1 className="mt-4 font-serif text-3xl font-semibold">Chat Narra</h1>
      <p className="mt-2 text-sm text-[#76656d]">Pesan tersimpan. Balasan AI menyusul di M4.</p>

      <div className="mt-6 flex-1 space-y-3 rounded-2xl border border-[#e8dce1] bg-white p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-[#76656d]">Belum ada pesan.</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl px-3 py-2 text-sm ${
                m.role === 'user' ? 'ml-8 bg-[#fff0f5]' : 'mr-8 bg-[#f8f1f4]'
              }`}
            >
              <p className="text-xs font-bold text-[#8f7f86]">{m.role}</p>
              <p className="mt-1 whitespace-pre-wrap text-[#3a2931]">{m.content}</p>
            </div>
          ))
        )}
      </div>

      <div className="mt-4">
        <ChatForm projectId={projectId} />
      </div>
    </main>
  );
}
