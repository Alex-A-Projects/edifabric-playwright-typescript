/**
 * Independent EDI (X12) parser used as the test oracle.
 *
 * The browser app converts EDI to JSON; to verify that conversion we parse the
 * ORIGINAL EDI text ourselves and compare it against the JSON the app produced.
 * Deliberately dependency-free and written independently of the app's logic.
 */

export interface EdiEnvelope {
  segmentDelimiter: string;
  elementDelimiter: string;
  repetitionDelimiter: string;
  componentDelimiter: string;
  /** Every segment, split into [segmentId, ...elementValues]. */
  segments: string[][];
}

export interface JsonSegment {
  /** Segment id as it appears in the JSON, e.g. "PO1". */
  id: string;
  /** The element properties of that segment, e.g. { "Quantity_02": "10" }. */
  props: Record<string, unknown>;
}

/** Trailing element position of a JSON property name, e.g. "Quantity_02" -> 2. */
export function elementPositionOf(propName: string): number | null {
  const match = /_(\d+)$/.exec(propName);
  return match ? Number(match[1]) : null;
}

/**
 * Splits an X12 interchange into segments and elements.
 * The ISA segment is fixed-width, so its delimiters are read by position.
 */
export function parseEdi(raw: string): EdiEnvelope {
  const text = raw.replace(/[\r\n]+/g, '');
  if (!text.startsWith('ISA')) {
    throw new Error(`Not an X12 interchange: expected the document to start with "ISA", got "${text.slice(0, 20)}"`);
  }
  if (text.length < 106) {
    throw new Error(`ISA segment is too short: expected at least 106 characters, got ${text.length}`);
  }

  const envelope: EdiEnvelope = {
    elementDelimiter: text[3],
    repetitionDelimiter: text[82],
    componentDelimiter: text[104],
    segmentDelimiter: text[105],
    segments: [],
  };

  for (const rawSegment of text.split(envelope.segmentDelimiter)) {
    if (!rawSegment) continue;
    const parts = rawSegment.split(envelope.elementDelimiter);
    envelope.segments.push(parts);
  }
  return envelope;
}

/** True when a JSON object holds element properties such as `{ "Quantity_02": "10" }`. */
function isSegmentProps(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).some((key) => elementPositionOf(key) !== null);
}

/** Segment ids are 2-5 upper case characters, e.g. "ISA", "PO1", "GS". */
const SEGMENT_ID = /^[A-Z][A-Z0-9]{1,4}$/;

/**
 * The segment id behind a container that holds segments directly, e.g. the
 * API puts the GE segment in a "GETrailers" array and the IEA segment in an
 * "IEATrailers" array.
 */
function segmentIdOfContainer(containerId: string): string {
  return containerId.replace(/Trailers$/, '');
}

/**
 * True when the object stored under `id` is a segment of the interchange.
 *
 * A segment normally carries element properties (`{ "Quantity_02": "10" }`),
 * but a segment without any element (the API can emit e.g. an empty `IEA`)
 * must still be recognised, otherwise it would silently disappear from the
 * comparison.
 */
function isSegmentObject(id: string | undefined, value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (isSegmentProps(value)) return true;
  return Boolean(id) && SEGMENT_ID.test(id as string) && Object.keys(value).length === 0;
}

/**
 * Some segments are wrapped in a header object, e.g.
 * `{ "ISA": { "ISA_InterchangeControlHeader": { "...": "..." } } }`.
 * Returns the element properties inside such a wrapper, or null.
 */
function wrappedSegmentProps(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const children = Object.values(value as Record<string, unknown>).filter(
    (child) => child && typeof child === 'object' && !Array.isArray(child),
  );
  if (children.length !== 1) return null;
  return isSegmentProps(children[0]) ? (children[0] as Record<string, unknown>) : null;
}

/**
 * Walks the JSON produced by the API and returns the segments it contains,
 * in document order, together with their element properties.
 *
 * Loop containers ("PO1Loop") and repeating segments ("REF": [ ... ]) are
 * flattened so that every segment is reported under its real segment id.
 * The trailer segments are reported under their segment id too ("GE",
 * "IEA"), even though the API keeps them in a "GETrailers"/"IEATrailers"
 * array.
 */
export function collectJsonSegments(node: unknown): JsonSegment[] {
  const found: JsonSegment[] = [];

  /**
   * @param current the node to inspect
   * @param id      the segment id to use when `current` is a segment object
   *                that is nested in an array (e.g. "REF": [ ... ])
   */
  const walk = (current: unknown, id?: string): void => {
    if (Array.isArray(current)) {
      current.forEach((item) => {
        // The array holds the segments themselves, e.g. "GETrailers": [ { ... } ].
        if (id && isSegmentProps(item)) {
          found.push({ id: segmentIdOfContainer(id), props: item as Record<string, unknown> });
          return;
        }
        walk(item, id);
      });
      return;
    }
    if (!current || typeof current !== 'object') return;

    if (id && isSegmentObject(id, current)) {
      found.push({ id, props: current as Record<string, unknown> });
      return;
    }

    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue; // strings/numbers (e.g. "Model")
      if (isSegmentObject(key, value)) {
        found.push({ id: key, props: value as Record<string, unknown> });
        continue;
      }
      // A segment wrapped in a header object keeps the segment id.
      const wrapped = SEGMENT_ID.test(key) ? wrappedSegmentProps(value) : null;
      if (wrapped) {
        found.push({ id: key, props: wrapped });
        continue;
      }
      walk(value, key);
    }
  };

  walk(node);
  return found;
}

export interface FieldMismatch {
  segmentId: string;
  property: string;
  ediValue: string;
  jsonValue: string;
}

/**
 * Compares the JSON produced by the app against the original EDI text.
 *
 * For every element the app emitted we look up the matching element position
 * in the corresponding EDI segment and compare the values. The reverse check
 * makes sure no non-empty EDI element was dropped on the way to JSON.
 *
 * Values are compared without trailing spaces: X12 treats an element's
 * trailing spaces as insignificant, and the ISA segment is fixed width, so
 * the converter is free to pad or trim it.
 */
export function diffJsonAgainstEdi(json: unknown, ediRaw: string): FieldMismatch[] {
  const envelope = parseEdi(ediRaw);
  const jsonSegments = collectJsonSegments(json);
  const mismatches: FieldMismatch[] = [];

  if (jsonSegments.length !== envelope.segments.length) {
    mismatches.push({
      segmentId: '*',
      property: 'segmentCount',
      ediValue: String(envelope.segments.length),
      jsonValue: String(jsonSegments.length),
    });
    return mismatches;
  }

  jsonSegments.forEach((jsonSegment, index) => {
    const ediSegment = envelope.segments[index];
    if (jsonSegment.id !== ediSegment[0]) {
      mismatches.push({
        segmentId: jsonSegment.id,
        property: 'segmentId',
        ediValue: ediSegment[0],
        jsonValue: jsonSegment.id,
      });
      return;
    }

    const ediElementAt = (position: number): string => ediSegment[position] ?? '';
    const normalize = (value: string): string => value.trimEnd();

    for (const [propName, propValue] of Object.entries(jsonSegment.props)) {
      const position = elementPositionOf(propName);
      if (position === null) continue; // not an element (e.g. a nested loop)
      // The API emits null for an element the EDI does not carry.
      if (propValue === null || propValue === undefined) continue;

      const ediValue = ediElementAt(position);
      const jsonValue = String(propValue);
      if (normalize(ediValue) !== normalize(jsonValue)) {
        mismatches.push({ segmentId: jsonSegment.id, property: propName, ediValue, jsonValue });
      }
    }

    // Reverse check: every non-empty EDI element must be present in the JSON.
    for (let position = 1; position < ediSegment.length; position++) {
      const ediValue = ediSegment[position];
      if (ediValue.trim() === '') continue;
      const emitted = Object.entries(jsonSegment.props).some(
        ([propName, propValue]) =>
          elementPositionOf(propName) === position &&
          propValue !== null &&
          propValue !== undefined &&
          normalize(String(propValue)) === normalize(ediValue),
      );
      if (!emitted) {
        mismatches.push({
          segmentId: jsonSegment.id,
          property: `element_${position}`,
          ediValue,
          jsonValue: '<missing from JSON>',
        });
      }
    }
  });

  return mismatches;
}
