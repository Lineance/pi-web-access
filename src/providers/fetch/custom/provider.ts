import { kindForStatus, WebSearchError } from "../../../orchestrator/errors.js";
import {
  charsetFromContentType,
  MAX_RESPONSE_BODY_BYTES,
  readResponseText,
} from "../../../transport/response-body.js";
import type { Transport } from "../../../transport/transport.js";
import { firstString, readDottedPath } from "../../dotted.js";
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
    const response = await this.transport(
      this.spec.url(request.url),
      this.init(request.url, signal),
    );

    const contentType = response.headers.get("content-type") ?? "";
    const text = await readResponseText(
      response,
      MAX_RESPONSE_BODY_BYTES,
      charsetFromContentType(contentType),
    );

    if (!response.ok) {
      throw new WebSearchError(
        kindForStatus(response.status),
        this.name,
        `${this.label} fetch error (${response.status})${this.spec.errorHint ?? ""}`,
        response.status,
      );
    }

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

  private init(requestUrl: string, signal: AbortSignal | undefined): RequestInit {
    const headers: Record<string, string> = { ...this.spec.headers };
    const header = this.spec.authHeaderName;
    if (header !== undefined && this.apiKey !== "") {
      headers[header] = `${this.spec.authPrefix ?? ""}${this.apiKey}`;
    }

    const init: RequestInit = {
      method: this.spec.method,
      headers,
      ...(signal === undefined ? {} : { signal }),
    };
    if (this.spec.method === "POST" && this.spec.body !== undefined) {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      init.body = JSON.stringify(substitute(this.spec.body, { url: requestUrl }));
    }
    return init;
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
