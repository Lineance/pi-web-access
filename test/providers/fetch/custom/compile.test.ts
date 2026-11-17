import { describe, expect, it } from "vitest";

import { compileFetchProvider } from "../../../../src/providers/fetch/custom/compile.js";

const base = { url: "https://reader.example.com/{url}" };

describe("compileFetchProvider", () => {
  it("compiles a reader with a text path", () => {
    const result = compileFetchProvider("my-reader", {
      ...base,
      fetch: { textPath: "data.markdown", titlePath: "data.title" },
      tier: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.meta).toEqual({
      name: "my-reader",
      label: "my-reader",
      keyless: true,
      tier: 2,
    });
    expect(result.spec.url("https://a.com/x", "")).toBe(
      "https://reader.example.com/https%3A%2F%2Fa.com%2Fx",
    );
    expect(result.spec.textPath).toBe("data.markdown");
    expect(result.spec.titlePath).toBe("data.title");
    expect(result.spec.method).toBe("GET");
  });

  it("treats a missing text path as whole-body text", () => {
    const result = compileFetchProvider("plain", base);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.textPath).toBeUndefined();
    expect(result.meta.tier).toBe(1);
  });

  it("carries the credential configuration", () => {
    const result = compileFetchProvider("auth-reader", {
      ...base,
      auth: { header: "x-api-key" },
      keyEnv: "READER_KEY",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta.envOnly).toBe(true);
    expect(result.spec.authHeaderName).toBe("x-api-key");
    expect(result.spec.authPrefix).toBe("");
  });

  it("refuses to shadow the local provider", () => {
    expect(compileFetchProvider("local", base)).toEqual({
      ok: false,
      message: 'shadows the built-in fetch provider "local"',
    });
  });

  it("requires keyEnv when auth is declared", () => {
    const result = compileFetchProvider("x", { ...base, auth: { header: "x" } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("auth requires keyEnv");
  });

  it("refuses a body on a GET", () => {
    const result = compileFetchProvider("x", { ...base, body: { a: 1 }, method: "GET" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("body requires method POST");
  });

  it("refuses an unknown field", () => {
    expect(compileFetchProvider("x", { ...base, textPath: "a.b" }).ok).toBe(false);
  });
});
