/**
 * Posts a sample EDI message to the EdiNation Cloud API and prints the raw
 * response. Useful for checking the API contract (and the subscription key)
 * without running the test suite.
 *
 *   EDIFABRIC_API_KEY=your-key npm run probe
 *
 * The subscription key is read from the environment; it is never printed.
 * Without one, the demo key published by ediFabric is used.
 */

const API_URL = process.env.EDIFABRIC_API_URL ?? 'https://api.edination.com/v2/x12/read';
const DEMO_API_KEY = 'bd96a836feca45cb91c86ee65d281f52';

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

const apiKey = process.env.EDIFABRIC_API_KEY?.trim() || DEMO_API_KEY;

if (!process.env.EDIFABRIC_API_KEY) {
  console.log('No EDIFABRIC_API_KEY set — using the shared demo key.');
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
