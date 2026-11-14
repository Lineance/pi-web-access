import { Type } from "typebox";

export const FetchCustomSchema = Type.Object(
  {
    label: Type.Optional(Type.String()),
    /** Target with a `{url}` placeholder, percent-encoded on substitution. */
    url: Type.String(),
    method: Type.Optional(Type.Union([Type.Literal("GET"), Type.Literal("POST")])),
    auth: Type.Optional(
      Type.Object(
        {
          header: Type.String(),
          prefix: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
    /** Environment variable holding the key. Keys are never read from this file. */
    keyEnv: Type.Optional(Type.String()),
    headers: Type.Optional(Type.Record(Type.String(), Type.String())),
    body: Type.Optional(Type.Unknown()),
    fetch: Type.Optional(
      Type.Object(
        {
          /** Dotted path holding the text. Absent means the whole body is the text. */
          textPath: Type.Optional(Type.String()),
          titlePath: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
    tier: Type.Optional(Type.Integer({ minimum: 1 })),
    errorHint: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
