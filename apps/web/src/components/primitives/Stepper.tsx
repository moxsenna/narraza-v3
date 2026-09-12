import type { HTMLAttributes } from 'react';

export type StepperStep = {
  readonly label: string;
  readonly state: 'done' | 'current' | 'upcoming';
};

export function Stepper({
  steps,
  className = '',
  ...props
}: HTMLAttributes<HTMLElement> & { steps: readonly StepperStep[] }) {
  const currentIndex = steps.findIndex((step) => step.state === 'current');
  return (
    <nav aria-label="Langkah" className={className} {...props}>
      <ol className="flex items-start gap-1">
        {steps.map((step, index) => (
          <li key={step.label} className="flex min-w-0 flex-1 items-start gap-1">
            <div className="flex w-full flex-col items-start gap-1">
              <span
                aria-hidden="true"
                className={
                  step.state === 'done'
                    ? 'h-1.5 w-full rounded-pill bg-status-success'
                    : step.state === 'current'
                      ? 'h-1.5 w-full rounded-pill bg-action-primary'
                      : 'h-1.5 w-full rounded-pill bg-line-200'
                }
              />
              <span
                aria-current={step.state === 'current' ? 'step' : undefined}
                className={
                  step.state === 'current'
                    ? 'text-xs font-bold text-primary'
                    : step.state === 'done'
                      ? 'text-xs font-semibold text-secondary'
                      : 'text-xs text-muted'
                }
              >
                {index + 1}. {step.label}
              </span>
            </div>
          </li>
        ))}
      </ol>
      {currentIndex >= 0 ? (
        <p className="sr-only">
          Langkah {currentIndex + 1} dari {steps.length}: {steps[currentIndex]?.label}
        </p>
      ) : null}
    </nav>
  );
}
