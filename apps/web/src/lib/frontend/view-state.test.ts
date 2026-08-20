import { expect, test } from 'vitest';
import { STATE_AXIS_VALUES } from './view-state';

test('locks exact independent axes', () => {
  expect(STATE_AXIS_VALUES).toEqual({
    capability: ['REAL', 'PRESENTATION', 'DISABLED'],
    view: ['loading', 'ready', 'empty', 'error', 'stale'],
    mutation: ['idle', 'saving', 'saved', 'blocked', 'error'],
    quote: ['unavailable', 'quoted', 'expired'],
    job: ['none', 'queued', 'running', 'succeeded', 'failed', 'dead', 'cancelled'],
    artifact: ['none', 'candidate', 'accepted'],
    draft: ['clean', 'saving', 'saved', 'conflict', 'stale'],
    validation: ['not-run', 'running', 'ready', 'stale'],
    presentation: ['editor', 'comparison', 'preview'],
  });
});
