import type { APIRequestContext } from '@playwright/test';

/** The EdiNation Cloud REST endpoint that converts EDI into JSON. */
export const EDI_READ_URL = 'https://api.edination.com/v2/x12/read';

/** Header EdiNation Cloud uses for the subscription key. */
export const SUBSCRIPTION_KEY_HEADER = 'Ocp-Apim-Subscription-Key';

/** Name of the environment variable that holds the subscription key. */
export const API_KEY_ENV_VAR = 'EDIFABRIC_API_KEY';

/**
 * The demo serial key ediFabric publishes for evaluation.
 *
 * It works against the Cloud API but has a limited quota, so it is only a
 * fallback: set EDIFABRIC_API_KEY to your own serial to use it instead.
 *
 * @see https://www.edifabric.com/docs/edifabric-cloud/introduction.html
 */
export const DEMO_API_KEY = 'bd96a836feca45cb91c86ee65d281f52';

export class EdiApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`EdiNation API returned HTTP ${status}: ${body}`);
    this.name = 'EdiApiError';
  }
}

/**
 * Thin client for the EdiNation Cloud "read" endpoint.
 *
 * The endpoint answers with an array of `X12Interchange` objects — the whole
 * interchange, i.e. ISA / Groups (GS, Transactions, GE) / IEA.
 *
 * @see https://www.edifabric.com/docs/edifabric-cloud/x12-operations.html
 */
export class EdiApiClient {
  private readonly apiKey: string;

  constructor(
    private readonly request: APIRequestContext,
    apiKey: string | undefined = process.env[API_KEY_ENV_VAR],
    private readonly url: string = EDI_READ_URL,
  ) {
    this.apiKey = apiKey?.trim() || DEMO_API_KEY;
  }

  /** True when a subscription key is available (own or the demo key). */
  get hasApiKey(): boolean {
    return Boolean(this.apiKey);
  }

  /** True when the key in use is the shared demo key rather than your own. */
  get usesDemoKey(): boolean {
    return this.apiKey === DEMO_API_KEY;
  }

  /**
   * Converts an EDI message to JSON.
   *
   * @returns the JSON document the API produced
   */
  async toJson(edi: string): Promise<unknown> {
    const response = await this.request.post(this.url, {
      headers: {
        [SUBSCRIPTION_KEY_HEADER]: this.requireApiKey(),
        'Content-Type': 'application/octet-stream',
      },
      data: Buffer.from(edi, 'utf-8'),
    });

    const body = await response.text();
    if (!response.ok()) {
      throw new EdiApiError(response.status(), body);
    }
    return EdiApiClient.parseBody(body);
  }

  /** The API sometimes answers with JSON encoded as a string, so unwrap it. */
  private static parseBody(body: string): unknown {
    const trimmed = body.trim();
    if (!trimmed) throw new Error('EdiNation API returned an empty body.');
    let payload: unknown = JSON.parse(trimmed);
    if (typeof payload === 'string') payload = JSON.parse(payload);
    return payload;
  }

  private requireApiKey(): string {
    if (!this.apiKey) {
      throw new Error(
        `No EdiNation subscription key found. Set the ${API_KEY_ENV_VAR} environment variable ` +
          'to a key from an active subscription, e.g. EDIFABRIC_API_KEY=... npm test',
      );
    }
    return this.apiKey;
  }
}
