import { expect } from 'chai';
import { stubEnv } from './support/env';

// Tests in a file run in order, so the second test observes what the first one left behind.
describe('stubEnv test helper', () => {
  const unsetName = 'CONSOLE_LOG_JSON_TEST_UNSET_VARIABLE';
  const setName = 'CONSOLE_LOG_JSON_TEST_SET_VARIABLE';
  process.env[setName] = 'original';
  delete process.env[unsetName];

  it('sets variables for the current test', () => {
    stubEnv(unsetName, 'stubbed');
    stubEnv(setName, 'changed');

    expect(process.env[unsetName]).to.equal('stubbed');
    expect(process.env[setName]).to.equal('changed');
  });

  it('restores them after each test', () => {
    expect(process.env[unsetName]).to.equal(undefined);
    expect(process.env[setName]).to.equal('original');
  });
});
