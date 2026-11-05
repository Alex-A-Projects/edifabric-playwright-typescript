import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where the subscription key is read from, in order:
 *
 * 1. the EDIFABRIC_API_KEY environment variable;
 * 2. a local `.edifabric-key` file (gitignored) — run `npm run setup` to
 *    create it.
 *
 * The key is deliberately NOT kept in the source: this repository is public,
 * and the demo key ediFabric publishes for evaluation has a shared quota.
 */

export const API_KEY_ENV_VAR = 'EDIFABRIC_API_KEY';

/** Name of the local, gitignored file that holds the key. */
export const API_KEY_FILE = '.edifabric-key';

/** Absolute path of the local key file, next to the project root. */
export const API_KEY_PATH = join(__dirname, '..', '..', API_KEY_FILE);

/** Reads the subscription key, or undefined when none is configured. */
export function readApiKey(): string | undefined {
  const fromEnv = process.env[API_KEY_ENV_VAR]?.trim();
  if (fromEnv) return fromEnv;

  if (existsSync(API_KEY_PATH)) {
    const fromFile = readFileSync(API_KEY_PATH, 'utf-8').trim();
    if (fromFile) return fromFile;
  }

  return undefined;
}

/** The message shown when no subscription key can be found. */
export const NO_API_KEY_MESSAGE =
  `No EdiNation subscription key found. Set the ${API_KEY_ENV_VAR} environment ` +
  'variable, or run "npm run setup" to store one in ' +
  `${API_KEY_FILE}. Get a key from https://www.edifabric.com/docs/edifabric-cloud/introduction.html ` +
  '(it publishes a demo serial key for evaluation).';
