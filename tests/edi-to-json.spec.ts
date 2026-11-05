import { test, expect } from '../src/fixtures/ediFixtures';
import { VALID_850, VALID_850_4010, VALID_850_MULTI_LINE } from '../src/data/ediSamples';
import {
  collectJsonSegments,
  diffJsonAgainstEdi,
  parseEdi,
  type FieldMismatch,
} from '../src/utils/ediParser';

/** Renders mismatches into a readable failure message. */
function describeMismatches(mismatches: FieldMismatch[]): string {
  return mismatches
    .map((m) => `  ${m.segmentId}.${m.property}: original EDI="${m.ediValue}" but JSON="${m.jsonValue}"`)
    .join('\n');
}

test.describe('EdiNation API - JSON fields must match the original EDI data', () => {
  test('every JSON field of an 850 matches the original EDI data', async ({ ediApi }) => {
    const json = await ediApi.toJson(VALID_850);

    const mismatches = diffJsonAgainstEdi(json, VALID_850);
    expect(
      mismatches,
      `JSON fields that do not match the source EDI:\n${describeMismatches(mismatches)}`,
    ).toEqual([]);
  });

  test('every JSON field matches the original EDI data when PO1 loops repeat', async ({ ediApi }) => {
    const json = await ediApi.toJson(VALID_850_MULTI_LINE);

    const mismatches = diffJsonAgainstEdi(json, VALID_850_MULTI_LINE);
    expect(
      mismatches,
      `JSON fields that do not match the source EDI:\n${describeMismatches(mismatches)}`,
    ).toEqual([]);
  });

  test('every JSON field of an 850 in the 4010 implementation matches the original EDI data', async ({
    ediApi,
  }) => {
    const json = await ediApi.toJson(VALID_850_4010);

    const mismatches = diffJsonAgainstEdi(json, VALID_850_4010);
    expect(
      mismatches,
      `JSON fields that do not match the source EDI:\n${describeMismatches(mismatches)}`,
    ).toEqual([]);
  });

  test('the JSON contains exactly the segments of the original message, in order', async ({ ediApi }) => {
    const json = await ediApi.toJson(VALID_850);

    const ediSegmentIds = parseEdi(VALID_850).segments.map((segment) => segment[0]);
    const jsonSegmentIds = collectJsonSegments(json).map((segment) => segment.id);

    expect(jsonSegmentIds).toEqual(ediSegmentIds);
  });

  /**
   * Guards against a vacuous comparison: the same API output must NOT match a
   * different EDI, otherwise the tests above would pass while checking
   * nothing at all.
   */
  test('the JSON does not match a different EDI message', async ({ ediApi }) => {
    const json = await ediApi.toJson(VALID_850);
    const differentEdi = VALID_850.replace('INV123', 'INV999').replace('DEPT1', 'DEPTX');

    const mismatches = diffJsonAgainstEdi(json, differentEdi);

    expect(
      mismatches.length,
      'The JSON matched an EDI message it was not built from — the comparison is not discriminating.',
    ).toBeGreaterThan(0);
    expect(mismatches.map((m) => m.property)).toContain('PurchaseOrderNumber_03');
    expect(mismatches.map((m) => m.property)).toContain('ReferenceIdentification_02');
  });
});
