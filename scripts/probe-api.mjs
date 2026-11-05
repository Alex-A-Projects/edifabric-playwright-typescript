/**
 * Posts a sample EDI message to the EdiNation Cloud API and prints the raw
 * response. Useful for checking the API contract (and the subscription key)
 * without running the test suite.
 *
 *   npm run probe
 *
 * The subscription key is read from the EDIFABRIC_API_KEY environment variable
 * or from the local .edifabric-key file. It is never printed.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_URL = process.env.EDIFABRIC_API_URL ?? 'https://api.edination.com/v2/x12/read';
const KEY_FILE = join(ROOT, '.edifabric-key');

const EDI = [
  'ISA*00*          *00*          *ZZ*SOURCE         *ZZ*TARGET         *240101*1200*^*00501*000000905*0*P*:~',
  'GS*PO*SOURCE*TARGET*20240101*1200*1*X*005010X230~',
  'ST*850*0001~',
  'BEG*00*SA*INV123**20240101~',
  'REF*DP*DEPT1~',
  'PO1*1*10*EA*10.50**BP*ITEM001~',
  'CTT*1~',
  'SE*6*0001~',
  'GE*1*1~',
  'IEA*1*000000905~',
].join('\n');

function readKey() {
  const fromEnv = process.env.EDIFABRIC_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  if (existsSync(KEY_FILE)) return readFileSync(KEY_FILE, 'utf-8').trim();
  return undefined;
}

const apiKey = readKey();

if (!apiKey) {
  console.error('No subscription key found.');
  console.error('Run "npm run setup" to store one, or set EDIFABRIC_API_KEY.');
  console.error(
    'Get a key from https://www.edifabric.com/docs/edifabric-cloud/introduction.html',
  );
  process.exit(1);
}

const response = await fetch(API_URL, {
  method: 'POST',
  headers: {
    'Ocp-Apim-Subscription-Key': apiKey,
    'Content-Type': 'application/octet-stream',
  },
  body: Buffer.from(EDI, 'utf-8'),
});

const body = await response.text();

console.log(`POST ${API_URL}`);
console.log(`HTTP ${response.status} ${response.statusText}`);
console.log('--- body ---');
console.log(body);

if (!response.ok) {
  process.exit(1);
}

// Summarise the payload the same way the tests read it: the segments of the
// interchange, in document order.
try {
  let payload = JSON.parse(body);
  if (typeof payload === 'string') payload = JSON.parse(payload);

  const segments = [];
  const walk = (node, id) => {
    if (Array.isArray(node)) {
      node.forEach((item) => {
        if (id && Object.keys(item ?? {}).some((key) => /_(\d+)$/.test(key))) {
          segments.push(id.replace(/Trailers$/, ''));
          return;
        }
        walk(item, id);
      });
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (!value || typeof value !== 'object') continue;
      if (Object.keys(value).some((k) => /_(\d+)$/.test(k))) segments.push(key);
      else walk(value, key);
    }
  };
  walk(payload);

  console.log('--- segments found in the JSON ---');
  console.log(segments.join(' '));
  console.log(`(${segments.length} segments)`);

  const ediSegments = EDI.split('~')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.split('*')[0]);
  console.log('--- segments in the source EDI ---');
  console.log(ediSegments.join(' '));
  console.log(`(${ediSegments.length} segments)`);
} catch (error) {
  console.error('Could not summarise the response:', error.message);
}
