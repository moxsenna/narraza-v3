import { describe, expect, it } from 'vitest';
import type { GenerationJobRecord, UnitOfWork } from '@narraza/application';
import { createM4JobProcessor, M4_WORKFLOW_KINDS } from './m4-job-processor.js';

const claimed = (kind: string): GenerationJobRecord => ({
  id: 'job-1',
  projectId: 'project-1',
  kind,
  status: 'running',
  priority: 0,
  availableAt: new Date('2026-01-01T00:00:00.000Z'),
  leaseToken: 'lease-1',
  leaseExpiresAt: new Date('2026-01-01T00:01:00.000Z'),
  fenceVersion: 1,
  cancelRequestedAt: null,
  retryOfJobId: null,
  bundleId: 'bundle-1',
  workflowPlanId: 'plan-1',
  reservationId: 'reservation-1',
  schemaVersion: 1,
  payload: {},
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
});

const neverUow = {
  execute: async () => {
    throw new Error('unit of work must not run');
  },
} as unknown as UnitOfWork;

describe('M4 job processor boundary', () => {
  it('exposes exact authoritative workflow allowlist', () => {
    expect(M4_WORKFLOW_KINDS).toEqual([
      'chat_intake_reply',
      'concept_generation',
      'foundation_generation',
      'character_generation',
      'outline_generation',
      'beat_write_judge',
      'safe_repair',
      'publish_package',
    ]);
  });

  it('fails closed on unknown job kind before DB or provider', async () => {
    const processor = createM4JobProcessor({ unitOfWork: neverUow, providers: new Map() });

    await expect(
      processor(claimed('chapter.write.compose'), new AbortController().signal),
    ).rejects.toThrow("rejects unknown job kind 'chapter.write.compose'");
  });

  it('requeues an already-aborted allowed job before DB or provider', async () => {
    const processor = createM4JobProcessor({ unitOfWork: neverUow, providers: new Map() });
    const controller = new AbortController();
    controller.abort();

    await expect(processor(claimed('concept_generation'), controller.signal)).resolves.toEqual({
      kind: 'requeue',
      delayMs: 0,
    });
  });
});
