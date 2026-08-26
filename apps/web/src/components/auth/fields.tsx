'use client';
import { useFormStatus } from 'react-dom';
import { Button, Field, Input } from '../primitives';

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
    <Field id={id} label={props.label}>
      {({ describedBy, invalid }) => (
        <Input
          id={id}
          name={props.name}
          type={props.type ?? 'text'}
          autoComplete={props.autoComplete}
          required={props.required}
          defaultValue={props.defaultValue}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
        />
      )}
    </Field>
  );
}

export function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Memproses…' : children}
    </Button>
  );
}

export function FormError({ message }: { message?: string | undefined }) {
  return message ? (
    <p
      role="alert"
      className="rounded-sm bg-status-danger-soft px-3 py-2 text-sm text-status-danger"
    >
      {message}
    </p>
  ) : null;
}

export function FormNotice({ message }: { message: string }) {
  return (
    <p className="rounded-sm bg-status-info-soft px-3 py-2 text-sm text-status-info">{message}</p>
  );
}
