import { test as base, expect } from '@playwright/test';
import { EdiApiClient } from '../api/ediApiClient';

export interface EdiFixtures {
  /** Client for the EdiNation Cloud EDI to JSON endpoint. */
  ediApi: EdiApiClient;
}

/**
 * Test fixtures for the EdiNation EDI to JSON API.
 *
 * The subscription key is read from the EDIFABRIC_API_KEY environment
 * variable; without one the shared demo key published by ediFabric is used,
 * so the suite runs out of the box.
 *
 * Usage:
 *   import { test, expect } from '../src/fixtures/ediFixtures';
 *
 *   test('...', async ({ ediApi }) => { ... });
 */
export const test = base.extend<EdiFixtures>({
  ediApi: async ({ request }, use) => {
    await use(new EdiApiClient(request));
  },
});

export { expect };
