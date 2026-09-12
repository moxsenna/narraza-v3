import type { ReactNode } from 'react';

type MobileNavIconName = 'home' | 'plan' | 'write' | 'check' | 'more';

const paths: Record<MobileNavIconName, ReactNode> = {
  home: (
    <>
      <path d="M3.75 9.5 12 3l8.25 6.5" />
      <path d="M5.75 8.75v10h12.5v-10M9.25 18.75v-5.5h5.5v5.5" />
    </>
  ),
  plan: (
    <>
      <path d="M7.5 4.5h9A2.5 2.5 0 0 1 19 7v12H7.5A2.5 2.5 0 0 1 5 16.5V7a2.5 2.5 0 0 1 2.5-2.5Z" />
      <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4.5" />
    </>
  ),
  write: (
    <>
      <path d="m4 20 4.25-.9L19 8.35a2.48 2.48 0 0 0-3.5-3.5L4.75 15.6 4 20Z" />
      <path d="m13.75 6.6 3.5 3.5M4.75 15.6l3.5 3.5" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.25 12.1 2.5 2.5 5-5.25" />
    </>
  ),
  more: (
    <>
      <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />
    </>
  ),
};

export function MobileNavIcon({ name }: { name: MobileNavIconName }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="21"
      height="21"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
