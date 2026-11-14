import { describe, expect, it } from "vitest";

import { errorCode, userMessage } from "./errors";

describe("userMessage", () => {
  it("maps the RPC error contract to customer copy", () => {
    expect(userMessage({ code: "P0001", message: "insufficient_points" })).toBe(
      "You don't have enough points for that.",
    );
    expect(userMessage({ code: "P0001", message: "redeem_limit_exceeded" })).toMatch(/half/);
    expect(userMessage({ code: "28000", message: "not_authenticated" })).toMatch(/sign in/i);
  });

  it("treats permission errors as forbidden", () => {
    expect(userMessage({ code: "42501", message: "permission denied for table orders" })).toBe(
      "You don't have permission to do that.",
    );
  });

  it("never leaks unknown database messages", () => {
    const msg = userMessage({ code: "23505", message: 'duplicate key violates "orders_pkey"' });
    expect(msg).toBe("Something went wrong. Please try again.");
    expect(userMessage(null)).toBe("Something went wrong. Please try again.");
  });

  it("does not resolve inherited object keys", () => {
    expect(userMessage({ message: "constructor" })).toBe("Something went wrong. Please try again.");
  });
});

describe("errorCode", () => {
  it("returns the stable identifier", () => {
    expect(errorCode({ message: " cart_empty " })).toBe("cart_empty");
    expect(errorCode(undefined)).toBe("unknown");
  });
});
