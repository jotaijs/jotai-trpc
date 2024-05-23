import { expect, test } from 'vitest';
import { createTRPCJotai } from 'jotai-trpc';

test('should export functions', () => {
  expect(createTRPCJotai).toBeDefined();
});
