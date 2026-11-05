import type { APIRequestContext } from '@playwright/test';
import { NO_API_KEY_MESSAGE, readApiKey } from './apiKey';

/** The EdiNation Cloud REST endpoint that converts EDI into JSON. */
export const EDI_READ_URL = 'https://api.edination.com/v2/x12/read';

/** Header EdiNation Cloud uses for the subscription key. */
export const SUBSCRIPTION_KEY_HEADER = 'Ocp-Apim-Subscription-Key';

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
  private readonly apiKey: string | undefined;

  constructor(
    private readonly request: APIRequestContext,
    apiKey?: string,
    private readonly url: string = EDI_READ_URL,
  ) {
    this.apiKey = apiKey ?? readApiKey();
  }

  /** True when a subscription key is available. */
  get hasApiKey(): boolean {
    return Boolean(this.apiKey);
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
      throw new Error(NO_API_KEY_MESSAGE);
    }
    return this.apiKey;
  }
}
