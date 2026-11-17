import { describe, expect, it } from "vitest";

import { compileSearchProvider } from "../../../../src/providers/search/custom/compile.js";

describe("{apiKey} in search specs", () => {
  it("is rejected at compile time", () => {
    const result = compileSearchProvider("my-engine", {
      url: "https://api.example.com/search?api_key={apiKey}",
      resultsPath: "data.items",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("auth + keyEnv");
  });
});
