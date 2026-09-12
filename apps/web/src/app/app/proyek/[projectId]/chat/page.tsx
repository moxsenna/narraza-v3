import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChatBubble } from '../../../../../components/composites/ChatBubble';
import {
  getMyProject,
  getProjectIntakeMessages,
  getProjectIntakeSignalCount,
} from '../../../../../server/domain/queries';
import { ChatForm } from './chat-form';
import { SignalPanel, StorySignalsSheet } from './story-signals';

export default async function ChatPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();
  const [messages, storedSignalCount] = await Promise.all([
    getProjectIntakeMessages(projectId),
    getProjectIntakeSignalCount(projectId),
  ]);
  const signalCount = Math.min(6, Math.max(0, storedSignalCount));

  return (
    <main className="flex h-[calc(100dvh-204px)] min-h-0 min-w-0 overflow-hidden bg-canvas lg:h-[calc(100dvh-136px)]">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[62px] items-center gap-3 border-b border-default bg-surface px-4 py-2 sm:px-6 xl:px-7">
          <Link
            href={`/app/proyek/${projectId}`}
            aria-label={`Kembali ke ${project.title}`}
            className="grid size-11 place-items-center rounded-full text-xl text-secondary hover:bg-surface-soft xl:hidden"
          >
            ‹
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-primary xl:text-xl">Chat Narra</h1>
            <p className="text-[11px] text-muted xl:text-xs">draft — belum jadi cerita resmi</p>
          </div>
          <StorySignalsSheet signalCount={signalCount} />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 xl:px-7 xl:py-5">
          <div className="mx-auto max-w-[680px]">
            <p className="mx-auto mb-5 w-fit rounded-pill bg-surface-soft px-3 py-1.5 text-center text-xs font-semibold text-secondary">
              Semua hasil ngobrol masih berupa draft — belum jadi cerita resmi
            </p>

            <div className="space-y-3" aria-label="Percakapan">
              {messages.length === 0 ? (
                <ChatBubble from="narra">
                  <p className="whitespace-pre-wrap">
                    Ceritakan ide yang ada di kepalamu. Garis besar pun cukup; jawabanmu akan
                    kusimpan sebagai draft.
                  </p>
                </ChatBubble>
              ) : (
                messages.map((message) =>
                  message.role === 'user' ? (
                    <ChatBubble key={message.id} from="user">
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </ChatBubble>
                  ) : (
                    <ChatBubble key={message.id} from="narra">
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </ChatBubble>
                  ),
                )
              )}
            </div>

            <div className="mt-5 rounded-lg border border-default bg-surface px-4 py-3 text-sm text-secondary">
              <p className="font-bold text-primary">Balasan Narra belum tersedia</p>
              <p className="mt-1 leading-6">
                Pesanmu tetap tersimpan. Kamu bisa menambah catatan sekarang, tetapi Narra belum
                dapat membalas atau merangkum sinyal otomatis.
              </p>
            </div>
          </div>
        </div>

        <ChatForm projectId={projectId} signalCount={signalCount} />
      </section>

      <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-default bg-surface p-5 lg:block">
        <SignalPanel signalCount={signalCount} />
      </aside>
    </main>
  );
}
