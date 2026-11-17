import { WebSearchError } from "../../../orchestrator/errors.js";
import {
  charsetFromContentType,
  MAX_RESPONSE_BODY_BYTES,
  readResponseText,
} from "../../../transport/response-body.js";
import type { Transport } from "../../../transport/transport.js";
import { firstString, readDottedPath } from "../../dotted.js";
import { requestWithRedirectChecks } from "../request.js";
import type { FetchedContent } from "../../types.js";
import type { FetchProvider, FetchProviderSpec, FetchRequest } from "../types.js";

import { substitute } from "../../substitute.js";

export class CustomFetchProvider implements FetchProvider {
  readonly name: string;
  readonly label: string;

  private readonly spec: FetchProviderSpec;
  private readonly transport: Transport;
  private readonly apiKey: string;

  constructor(spec: FetchProviderSpec, transport: Transport, apiKey = "") {
    this.spec = spec;
    this.name = spec.name;
    this.label = spec.label;
    this.transport = transport;
    this.apiKey = apiKey;
  }

  async fetch(request: FetchRequest, signal?: AbortSignal): Promise<FetchedContent> {
    const init = this.init(request.url);
    // Every hop is validated like the keyless providers: a vendor endpoint that
    // redirects must not hand the socket to a private address. Non-ok statuses
    // are classified by status inside the loop, hint included.
    const { response } = await requestWithRedirectChecks(
      this.name,
      this.transport,
      init.url,
      signal,
      {
        method: init.method,
        headers: init.headers,
        ...(init.body === undefined ? {} : { body: init.body }),
      },
      this.spec.errorHint,
    );

    const contentType = response.headers.get("content-type") ?? "";
    const text = await readResponseText(
      response,
      MAX_RESPONSE_BODY_BYTES,
      charsetFromContentType(contentType),
    );

    const content = this.extract(text);
    const title = this.extractTitle(text);
    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader === null ? undefined : Number(contentLengthHeader);

    return {
      kind: "text",
      text: content,
      ...(title === undefined ? {} : { title }),
      ...(contentType === "" ? {} : { contentType }),
      ...(contentLength === undefined || Number.isNaN(contentLength) ? {} : { contentLength }),
    };
  }

  private init(requestUrl: string): {
    url: string;
    method: "GET" | "POST";
    headers: Record<string, string>;
    body?: string;
  } {
    const headers: Record<string, string> = { ...this.spec.headers };
    const header = this.spec.authHeaderName;
    if (header !== undefined && this.apiKey !== "") {
      headers[header] = `${this.spec.authPrefix ?? ""}${this.apiKey}`;
    }

    let body: string | undefined;
    if (this.spec.method === "POST" && this.spec.body !== undefined) {
      body = JSON.stringify(substitute(this.spec.body, { url: requestUrl, apiKey: this.apiKey }));
    }
    return {
      url: this.spec.url(requestUrl, this.apiKey),
      method: this.spec.method,
      headers,
      ...(body === undefined ? {} : { body }),
    };
  }

  private extract(body: string): string {
    if (this.spec.textPath === undefined) return body;

    const parsed = this.parse(body);
    const value = readDottedPath(parsed, this.spec.textPath);
    if (typeof value !== "string") {
      throw new WebSearchError(
        "parse",
        this.name,
        `${this.label} returned no text at "${this.spec.textPath}"`,
      );
    }
    return value;
  }

  private extractTitle(body: string): string | undefined {
    if (this.spec.titlePath === undefined) return undefined;
    const title = firstString(readDottedPath(this.parse(body), this.spec.titlePath));
    return title === "" ? undefined : title;
  }

  private parse(body: string): unknown {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new WebSearchError("parse", this.name, `${this.label} returned a non-JSON body`);
    }
  }
}
