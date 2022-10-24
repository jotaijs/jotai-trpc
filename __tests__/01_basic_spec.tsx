import { createTRPCJotai } from '../src/index';

describe('basic spec', () => {
  it('should export functions', () => {
    expect(createTRPCJotai).toBeDefined();
  });
});
