'use client';
import { useFormStatus } from 'react-dom';

// Minimal shared auth form primitives (M0). Full design-system components +
// tokens land in M6 (W6.1); these use the brand primitives seeded in globals.css
// and keep tap targets ≥44px / visible focus rings for baseline a11y.

export function TextField(props: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  const id = `f-${props.name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-neutral-700">
        {props.label}
      </label>
      <input
        id={id}
        name={props.name}
        type={props.type ?? 'text'}
        autoComplete={props.autoComplete}
        required={props.required}
        defaultValue={props.defaultValue}
        className="h-12 rounded-xl border border-neutral-300 px-3.5 text-[15px] outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/30"
      />
    </div>
  );
}

export function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-12 rounded-xl bg-brand-700 px-4 text-[15px] font-bold text-white transition hover:bg-brand-900 focus:ring-3 focus:ring-brand-500/40 disabled:opacity-60"
    >
      {pending ? 'Memproses…' : children}
    </button>
  );
}

export function FormError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

export function FormNotice({ message }: { message: string }) {
  return <p className="rounded-lg bg-brand-500/10 px-3 py-2 text-sm text-brand-900">{message}</p>;
}
