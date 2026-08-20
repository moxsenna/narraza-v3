import { CAPABILITIES, CAPABILITY_REASON_MESSAGES } from '../../lib/frontend/capabilities';
import type { CapabilityNoticeViewModel } from '../../lib/frontend/view-model';
import { Badge, LinkButton, Surface } from '../primitives';

export function CapabilityNotice({ notice }: { notice: CapabilityNoticeViewModel }) {
  const capability = CAPABILITIES[notice.capabilityKey];
  if (capability.mode === 'REAL') return null;

  const label = capability.mode === 'PRESENTATION' ? 'Pratinjau fitur' : 'Segera tersedia';

  return (
    <Surface className="rounded-lg border border-default p-4">
      <Badge tone="warning">{label}</Badge>
      <p className="mt-2 text-sm text-secondary">{CAPABILITY_REASON_MESSAGES[notice.reasonCode]}</p>
      {notice.nextAction ? (
        <LinkButton
          aria-label={`${capability.primaryAction.label}: ${notice.nextAction.label}`}
          className="mt-3"
          variant="secondary"
          href={notice.nextAction.href}
        >
          {notice.nextAction.label}
        </LinkButton>
      ) : null}
    </Surface>
  );
}
