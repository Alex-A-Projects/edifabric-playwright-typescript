/**
 * Stores the EdiNation Cloud subscription key in a local, gitignored file.
 *
 *   npm run setup
 *
 * The key is never written to the source or committed — this repository is
 * public. Get a key from:
 *   https://www.edifabric.com/docs/edifabric-cloud/introduction.html
 * which publishes a demo serial key for evaluation, or sign up for a serial
 * of your own at https://www.edifabric.com/pricing.html
 */

import { writeFileSync, chmodSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY_FILE = join(ROOT, '.edifabric-key');

if (existsSync(KEY_FILE)) {
  const existing = readFileSync(KEY_FILE, 'utf-8').trim();
  if (existing) {
    console.log(`A key is already stored in ${KEY_FILE} — leaving it alone.`);
    console.log('Delete that file and run "npm run setup" again to replace it.');
    process.exit(0);
  }
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = (await rl.question('EdiNation serial key (Ocp-Apim-Subscription-Key): ')).trim();
rl.close();

if (!answer) {
  console.error('No key entered — nothing was written.');
  process.exit(1);
}

writeFileSync(KEY_FILE, `${answer}\n`, { mode: 0o600 });
chmodSync(KEY_FILE, 0o600);

console.log(`Key stored in ${KEY_FILE} (gitignored). Run "npm test".`);
