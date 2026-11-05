# EdiNation EDI → JSON — Playwright + TypeScript (API only)

Test framework that verifies the **EdiNation Cloud REST API** turns an EDI message
into JSON whose *every field still matches the original EDI data*.

No browser is involved: the tests call the API directly through Playwright's
`APIRequestContext`.

## The endpoint

```
POST https://api.edination.com/v2/x12/read
Ocp-Apim-Subscription-Key: <your subscription key>
Content-Type: application/octet-stream

<raw EDI bytes>
```

The response is `application/json`: **an array of `X12Interchange` objects**, i.e.
the whole interchange —

```json
[ { "SegmentDelimiter": "~",
    "ISA": { "InterchangeControlStandardsIdentifier_11": "^", ... },
    "TA1": null,
    "Groups": [ { "GS": { ... },
                  "Transactions": [ { "ST": { ... }, "BEG": { ... } } ],
                  "GETrailers": [ { "NumberOfIncludedSets_1": "1" } ] } ],
    "IEATrailers": [ { "NumberOfIncludedGroups_1": "1" } ],
    "Result": { "Status": "success" } } ]
```

Two details the API adds that the comparison has to account for:

- an element the EDI does not carry is emitted as **`null`**, not omitted;
- the trailer segments live in **`GETrailers` / `IEATrailers`** arrays.

> API v3 (`POST /v3/x12/parse`) is the newer equivalent: one call does read +
> validate (+ acknowledge) and returns the same interchange array. It is not
> used here because v2 `/x12/read` is the operation the EdiNation tooling
> documents for "translate X12 to JSON".
>
> See <https://www.edifabric.com/docs/edifabric-cloud/x12-operations.html>.

## Setup

```bash
npm install
npm run setup     # stores the subscription key locally (gitignored)
npm test
```

`npm run setup` asks for the serial and writes it to `.edifabric-key`, which is
gitignored — **the key is never committed**, this repository is public.

Get a key from
<https://www.edifabric.com/docs/edifabric-cloud/introduction.html>, which
publishes a **demo serial key** for evaluation, or sign up for a serial of your
own (the free Community tier and the 14-day trial both include ediFabric Cloud —
<https://www.edifabric.com/pricing.html>).

You can also pass the key through the environment instead of a file, which is
what CI should do:

```bash
export EDIFABRIC_API_KEY=your-own-serial
npm test
```

Without a valid key the API answers

```
401 { "statusCode": 401,
     "message": "Access denied due to invalid subscription key.
                 Make sure to provide a valid key for an active subscription." }
```

When no key is configured at all, the tests are **skipped locally** with a
message saying why, and **fail in CI**, where a silently skipped suite would be
a false green. The key is never logged.

## How the verification works

The API's own output is never trusted on its own. For every test the framework:

1. parses the **original EDI text** with its own independent parser
   (`src/utils/ediParser.ts`) — ISA delimiters are read by position, the rest is
   split on the segment/element delimiters;
2. collects the segments the API produced, flattening loop containers
   (`PO1Loop`), repeating segments (`REF: [ ... ]`) and trailer containers
   (`GETrailers`, `IEATrailers`);
3. compares the two **element by element**: every JSON property ending in
   `_NN` is matched against element `NN` of the corresponding EDI segment, and
   every non-empty EDI element must be present in the JSON.

`null` means "the EDI has no value here", so it is compared as empty.
Trailing spaces are insignificant per X12, and the ISA segment is fixed width,
so the converter may pad or trim it — both sides are trimmed before comparing.

A mismatch is reported with both values, e.g.

```
BEG.PurchaseOrderNumber_03: original EDI="INV123" but JSON="INV124"
```

## The tests

All five hit the live API.

| Test | What it proves |
| --- | --- |
| `every JSON field of an 850 matches the original EDI data` | every element of a 850 in the 5010 implementation survives the conversion |
| `every JSON field matches the original EDI data when PO1 loops repeat` | a second `PO1` line is preserved, and nothing bleeds between lines |
| `every JSON field of an 850 in the 4010 implementation matches the original EDI data` | the same holds for the 4010 implementation of the 850 |
| `the JSON contains exactly the segments of the original message, in order` | no segment is dropped, added or reordered |
| `the JSON does not match a different EDI message` | the comparison really discriminates — the same JSON must fail against an EDI with two values changed, so the tests above cannot pass vacuously |

## Layout

```
src/
  api/ediApiClient.ts    client for POST /v2/x12/read
  api/apiKey.ts          reads the subscription key (env var or local file)
  data/ediSamples.ts     EDI test data + builders for ISA/GS envelopes
  fixtures/              Playwright fixtures (the `ediApi` fixture)
  utils/ediParser.ts     independent EDI parser + JSON/EDI comparison (the oracle)
tests/
  edi-to-json.spec.ts    the tests
scripts/
  setup.mjs              stores the subscription key in .edifabric-key
  probe-api.mjs          posts a sample EDI and prints the raw response
```

## Running

```bash
npm run setup            # store the subscription key locally (once)
npm test                 # run the suite
npm test -- --reporter=html   # open the HTML report
npm run probe            # raw API call, no test runner
npm run lint             # type check
```

## Notes

- The public EdiNation web tool converts EDI **locally in WebAssembly**
  ("EDI never leaves your browser"). It uses the cloud only to download the
  X12 spec, through `https://api.edination.com/wa/v1`. That API accepts the
  demo key embedded in the page's `edination.api.config.js`, but
  `/v2/x12/read` and `/v3/x12/parse` do not — they need a serial from
  ediFabric's docs, or your own.
- The samples use the 850 purchase order in the 5010 and 4010 implementations.
  The API's spec catalogue is narrower than the web tool's: transaction sets
  such as 855, 856 and 810 are rejected with
  `Format not found in EdiNation for format=X12 version=...`.
