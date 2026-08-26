import { expect, test } from 'vitest';
import { makeProjectIdentityViewModel, makeShellAccountViewModel } from './view-model';

test('maps least-data shell models', () => {
  expect(makeShellAccountViewModel('a@example.test')).toEqual({
    email: 'a@example.test',
    initial: 'A',
  });
  expect(makeProjectIdentityViewModel('p1', 'Judul')).toEqual({ projectId: 'p1', title: 'Judul' });
});

test('uses a safe visible initial when email is blank', () => {
  expect(makeShellAccountViewModel('   ')).toEqual({ email: '   ', initial: '?' });
});
