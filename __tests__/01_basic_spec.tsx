import { createAtomCreators } from '../src/index';

describe('basic spec', () => {
  it('should export functions', () => {
    expect(createAtomCreators).toBeDefined();
  });
});
