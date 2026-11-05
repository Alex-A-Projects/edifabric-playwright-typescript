/**
 * EDI test data.
 *
 * The ISA segment is fixed width (106 characters including the terminator),
 * so it is built by a helper to keep every sample well formed.
 */

const ISA_ELEMENT_SEPARATOR = '*';
const ISA_COMPONENT_SEPARATOR = ':';
const ISA_REPETITION_SEPARATOR = '^';
const ISA_SEGMENT_TERMINATOR = '~';

/** Builds a fixed-width, spec-compliant ISA segment. */
export function buildIsa(options: {
  sender?: string;
  receiver?: string;
  date?: string; // CCYYMMDD
  time?: string; // HHMM
  controlNumber?: string; // exactly 9 digits
  version?: string; // 5 digits
  usageIndicator?: 'T' | 'P';
} = {}): string {
  const {
    sender = 'SOURCE',
    receiver = 'TARGET',
    date = '240101',
    time = '1200',
    controlNumber = '000000905',
    version = '00501',
    usageIndicator = 'P',
  } = options;

  const pad = (value: string, length: number) => value.padEnd(length, ' ').slice(0, length);

  return (
    'ISA' +
    ISA_ELEMENT_SEPARATOR +
    '00' + ISA_ELEMENT_SEPARATOR +
    pad('', 10) + ISA_ELEMENT_SEPARATOR +
    '00' + ISA_ELEMENT_SEPARATOR +
    pad('', 10) + ISA_ELEMENT_SEPARATOR +
    'ZZ' + ISA_ELEMENT_SEPARATOR +
    pad(sender, 15) + ISA_ELEMENT_SEPARATOR +
    'ZZ' + ISA_ELEMENT_SEPARATOR +
    pad(receiver, 15) + ISA_ELEMENT_SEPARATOR +
    date + ISA_ELEMENT_SEPARATOR +
    time + ISA_ELEMENT_SEPARATOR +
    ISA_REPETITION_SEPARATOR + ISA_ELEMENT_SEPARATOR +
    version + ISA_ELEMENT_SEPARATOR +
    controlNumber.padStart(9, '0') + ISA_ELEMENT_SEPARATOR +
    '0' + ISA_ELEMENT_SEPARATOR +
    usageIndicator + ISA_ELEMENT_SEPARATOR +
    ISA_COMPONENT_SEPARATOR +
    ISA_SEGMENT_TERMINATOR
  );
}

/** Wraps a transaction set in the ISA/GS/IEA envelope. */
export function buildInterchange(
  transaction: string[],
  options: Parameters<typeof buildIsa>[0] & {
    /** GS01 functional identifier code, e.g. "PO" for 850, "HC" for 837P. */
    code?: string;
    /** GS08 version and release, e.g. "005010X230" for an 850. */
    version?: string;
  } = {},
): string {
  const { code = 'PO', version = '005010X230', ...isaOptions } = options;
  return [
    buildIsa(isaOptions),
    `GS*${code}*SOURCE*TARGET*20240101*1200*1*X*${version}~`,
    ...transaction,
    'GE*1*1~',
    'IEA*1*000000905~',
  ].join('\n');
}

/** A complete, spec-valid X12 850 purchase order. */
export const VALID_850 = buildInterchange([
  'ST*850*0001~',
  'BEG*00*SA*INV123**20240101~',
  'REF*DP*DEPT1~',
  'PO1*1*10*EA*10.50**BP*ITEM001~',
  'CTT*1~',
  'SE*6*0001~',
]);

/** The same 850 with two line items, used to check repeating PO1 loops. */
export const VALID_850_MULTI_LINE = buildInterchange([
  'ST*850*0001~',
  'BEG*00*SA*INV123**20240101~',
  'REF*DP*DEPT1~',
  'PO1*1*10*EA*10.50**BP*ITEM001~',
  'PO1*2*5*EA*3.25**BP*ITEM002~',
  'CTT*2~',
  'SE*7*0001~',
]);

/** The same purchase order in the older 4010 implementation, to cover a second spec. */
export const VALID_850_4010 = buildInterchange(
  [
    'ST*850*0001~',
    'BEG*00*SA*INV123**20240101~',
    'REF*DP*DEPT1~',
    'PO1*1*10*EA*10.50**BP*ITEM001~',
    'CTT*1~',
    'SE*6*0001~',
  ],
  { version: '004010X230' },
);
