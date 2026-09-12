'use client';

import { notFound } from 'next/navigation';
import { useState } from 'react';
import { ChatBubble } from '../../../components/composites/ChatBubble';
import { FindingCard } from '../../../components/composites/FindingCard';
import { ProposalCard } from '../../../components/composites/ProposalCard';
import { QuickReplies } from '../../../components/composites/QuickReplies';
import { Tabs } from '../../../components/composites/Tabs';
import {
  Badge,
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  Input,
  ProgressChecklist,
  Skeleton,
  Stepper,
  Textarea,
  Toast,
} from '../../../components/primitives';

if (process.env.NODE_ENV === 'production') notFound();

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold text-primary">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export default function KomponenShowcasePage() {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <main className="mx-auto w-full max-w-3xl bg-canvas px-4 py-10 sm:px-6">
      <p className="text-xs font-extrabold tracking-[0.12em] text-brand-strong">DEV SAJA</p>
      <h1 className="mt-2 text-3xl font-bold text-primary">Galeri Komponen Narraza</h1>
      <p className="mt-2 text-sm leading-6 text-secondary">
        Halaman ini hanya ada di development untuk meninjau design system. Tidak tertaut dari
        navigasi produksi.
      </p>

      <Section title="Tabs">
        <Tabs
          label="Contoh tab"
          activeKey="tulis"
          tabs={[
            { key: 'rencana', label: 'Rencana', href: '#tab-rencana' },
            { key: 'tulis', label: 'Tulis', href: '#tab-tulis', badge: '3' },
            { key: 'cek', label: 'Cek', href: '#tab-cek' },
          ]}
        />
      </Section>

      <Section title="ProposalCard">
        <ProposalCard
          title="Jadikan Laras sebagai sudut pandang bab ini"
          summary="Narasi memakai pengetahuan Laras sehingga petunjuk rahasia ikut terasa."
          impact="Mengubah 2 adegan dan menahan 1 rahasia sampai bab 4."
          risk="low"
          actions={
            <>
              <Button variant="secondary">Ubah</Button>
              <Button>Tinjau usulan</Button>
            </>
          }
        />
        <ProposalCard
          title="Hapus tokoh Bima dari bab ini"
          summary="Bima tidak muncul sama sekali sampai bab berikutnya."
          risk="high"
          actions={
            <>
              <Button variant="secondary">Tolak</Button>
              <Button variant="destructive">Terima dengan konfirmasi</Button>
            </>
          }
        />
      </Section>

      <Section title="FindingCard">
        <FindingCard
          severity="blocking"
          message="Rahasia terbuka terlalu cepat."
          reason="Adegan 3 menyebut jawaban yang dijadwalkan untuk bab 6."
        />
        <FindingCard severity="warning" message="Pengetahuan tokoh perlu ditinjau." />
        <FindingCard severity="info" message="Cerita nyambung." />
      </Section>

      <Section title="ChatBubble + QuickReplies">
        <ChatBubble from="narra">
          <p>Ceritakan ide yang ada di kepalamu.</p>
        </ChatBubble>
        <ChatBubble from="user">
          <p>Tokoh utamaku seorang penjaga mercusuar.</p>
        </ChatBubble>
        <QuickReplies
          options={['Tokoh utamanya sudah ada', 'Aku baru punya konfliknya']}
          onSelect={setPicked}
        />
        {picked ? <p className="text-sm text-secondary">Dipilih: {picked}</p> : null}
      </Section>

      <Section title="Banner, Toast, EmptyState">
        <Banner tone="info" title="Info">
          Pesanmu tersimpan sebagai draft.
        </Banner>
        <Toast tone="success" title="Tersimpan">
          Fondasi diperbarui tanpa mengubah cerita resmi.
        </Toast>
        <EmptyState title="Belum ada usulan" action={<Button>Mulai menulis</Button>}>
          Usulan Narra akan muncul di sini setelah ada tulisan nyata.
        </EmptyState>
      </Section>

      <Section title="ProgressChecklist + Stepper">
        <ProgressChecklist
          percent={62}
          statusText="Hampir siap dikunci"
          items={[
            { label: 'Konsep inti', done: true },
            { label: 'Konflik utama', done: false, hint: 'Tambahkan 1 konflik.' },
          ]}
          recommendation="Lengkapi konflik utama lebih dulu."
        />
        <Stepper
          steps={[
            { label: 'Ide', state: 'done' },
            { label: 'Fondasi', state: 'current' },
            { label: 'Outline', state: 'upcoming' },
          ]}
        />
      </Section>

      <Section title="Primitives">
        <div className="flex flex-wrap gap-2">
          <Button>Primer</Button>
          <Button variant="secondary">Sekunder</Button>
          <Button variant="tertiary">Tersier</Button>
          <Chip selected={false}>Chip</Chip>
          <Badge tone="brand">Badge</Badge>
        </div>
        <Card>
          <Input aria-label="Contoh input" placeholder="Nama tokoh" />
          <Textarea aria-label="Contoh textarea" className="mt-3" placeholder="Catatan" />
        </Card>
        <Skeleton className="h-12 w-full" />
      </Section>
    </main>
  );
}
