import { restoreStubbedEnv } from './env';

// Registered for every test file via setupFilesAfterEach in jest.config.cjs.
afterEach(() => {
  restoreStubbedEnv();
});
