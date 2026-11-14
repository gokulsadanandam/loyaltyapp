import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it.each(["/", "/cart", "/orders/abc?placed=1", "/products/LGC-001#specs"])(
    "allows %s",
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([
    "//evil.com",
    "/\\evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "evil.com",
    "",
    "/\u0000x",
    "/\tevil",
    undefined,
    null,
    42,
  ])("rejects %j", (value) => {
    expect(safeNextPath(value, "/fallback")).toBe("/fallback");
  });

  it("normalises dot segments without leaving the origin", () => {
    expect(safeNextPath("/a/../../cart")).toBe("/cart");
  });
});
