import { Type } from "typebox";

export const SearchCustomSchema = Type.Object(
  {
    label: Type.Optional(Type.String()),
    url: Type.String(),
    method: Type.Optional(Type.Union([Type.Literal("GET"), Type.Literal("POST")])),
    auth: Type.Optional(
      Type.Object(
        {
          /** Header carrying the credential, e.g. `authorization` or `x-api-key`. */
          header: Type.String(),
          /** Prepended verbatim, e.g. `Bearer `. Empty means a bare key. */
          prefix: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
    /** Environment variable holding the key. Keys are never read from this file. */
    keyEnv: Type.Optional(Type.String()),
    headers: Type.Optional(Type.Record(Type.String(), Type.String())),
    body: Type.Optional(Type.Unknown()),
    query: Type.Optional(Type.Record(Type.String(), Type.String())),
    resultsPath: Type.String(),
    fields: Type.Optional(
      Type.Object(
        {
          title: Type.Optional(Type.String()),
          url: Type.Optional(Type.String()),
          /** First non-empty candidate wins, matching the built-in providers. */
          snippet: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
        },
        { additionalProperties: false },
      ),
    ),
    /** Any positive integer; tiers need not be contiguous. */
    tier: Type.Optional(Type.Integer({ minimum: 1 })),
    maxResults: Type.Optional(Type.Integer({ minimum: 1 })),
    errorHint: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
