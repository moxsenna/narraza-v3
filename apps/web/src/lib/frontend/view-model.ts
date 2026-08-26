import type { CapabilityKey, CapabilityReasonCode } from './capabilities';

export type ShellAccountViewModel = Readonly<{ email: string; initial: string }>;
export type ProjectIdentityViewModel = Readonly<{ projectId: string; title: string }>;
export type CapabilityNoticeViewModel = Readonly<{
  capabilityKey: CapabilityKey;
  reasonCode: Exclude<CapabilityReasonCode, 'AVAILABLE'>;
  nextAction?: Readonly<{ label: string; href: string }>;
}>;

export function makeShellAccountViewModel(email: string): ShellAccountViewModel {
  return Object.freeze({
    email,
    initial: email.trim().charAt(0).toLocaleUpperCase('id-ID') || '?',
  });
}

export function makeProjectIdentityViewModel(
  projectId: string,
  title: string,
): ProjectIdentityViewModel {
  return Object.freeze({ projectId, title });
}
