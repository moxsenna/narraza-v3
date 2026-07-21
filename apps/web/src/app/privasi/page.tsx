import Link from 'next/link';
import { BrandMark } from '../../components/BrandMark';
import { APP_MESSAGES_ID } from '../../messages/app-id';

export default function PrivacyPage() {
  const copy = APP_MESSAGES_ID.legal.privacy;

  return (
    <div className="min-h-screen overflow-x-clip bg-[#fff9f6] text-[#24171e]">
      <header className="border-b border-[#f1e8ec] bg-white">
        <div className="mx-auto flex min-h-[68px] max-w-5xl items-center px-4 sm:px-6">
          <BrandMark href="/" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
        <p className="inline-flex rounded-full bg-[#fce6ee] px-4 py-2 text-sm font-bold text-[#842644]">
          {APP_MESSAGES_ID.legal.status}
        </p>
        <h1 className="mt-6 font-serif text-4xl font-semibold">{copy.title}</h1>
        <p className="mt-5 text-base leading-8 text-[#4a3a42]">{copy.description}</p>
        <Link
          href="/"
          className="mt-8 inline-flex min-h-11 items-center rounded-xl border border-[#e8dce1] bg-white px-5 font-semibold text-brand-900 hover:border-[#ef91af] hover:bg-[#fff5f8] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          {APP_MESSAGES_ID.common.backHome}
        </Link>
      </main>
    </div>
  );
}
