import { test as base, expect } from '@playwright/test';
import { NO_API_KEY_MESSAGE } from '../api/apiKey';
import { EdiApiClient } from '../api/ediApiClient';

export interface EdiFixtures {
  /** Client for the EdiNation Cloud EDI to JSON endpoint. */
  ediApi: EdiApiClient;
}

/**
 * Test fixtures for the EdiNation EDI to JSON API.
 *
 * The subscription key is read from the EDIFABRIC_API_KEY environment
 * variable, or from the local .edifabric-key file written by "npm run setup".
 *
 * Usage:
 *   import { test, expect } from '../src/fixtures/ediFixtures';
 *
 *   test('...', async ({ ediApi }) => { ... });
 */
export const test = base.extend<EdiFixtures>({
  ediApi: async ({ request }, use) => {
    const ediApi = new EdiApiClient(request);

    if (!ediApi.hasApiKey) {
      // Skipping locally keeps the suite runnable without a key; in CI a
      // missing key is an error, because a silently skipped suite is a
      // false green.
      if (process.env.CI) {
        throw new Error(NO_API_KEY_MESSAGE);
      }
      test.skip(true, NO_API_KEY_MESSAGE);
    }

    await use(ediApi);
  },
});

export { expect };
