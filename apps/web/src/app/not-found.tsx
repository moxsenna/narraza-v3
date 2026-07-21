import Link from 'next/link';
import { BrandMark } from '../components/BrandMark';
import { APP_MESSAGES_ID } from '../messages/app-id';

export default function NotFound() {
  const copy = APP_MESSAGES_ID.notFound;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center overflow-x-clip bg-[#fff9f6] px-4 py-12 text-center text-[#24171e]">
      <BrandMark href="/" />
      <p className="mt-10 text-sm font-extrabold tracking-[0.14em] text-brand-700">
        {copy.eyebrow}
      </p>
      <h1 className="mt-3 text-balance font-serif text-4xl font-semibold">{copy.title}</h1>
      <p className="mt-4 max-w-md leading-7 text-[#4a3a42]">{copy.description}</p>
      <Link
        href="/"
        className="mt-8 inline-flex min-h-11 items-center rounded-xl bg-brand-500 px-6 font-bold text-white hover:bg-brand-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        {APP_MESSAGES_ID.common.backHome}
      </Link>
    </main>
  );
}
