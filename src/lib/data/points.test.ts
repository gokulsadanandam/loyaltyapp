import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/account", () => ({ getAccountSummary: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { entryLabel, parseCursor } = await import("./points");

describe("parseCursor", () => {
  it("keeps the database timestamp verbatim (microseconds intact)", () => {
    expect(parseCursor("2026-11-14T04:21:09.123456+00:00|42")).toEqual({
      createdAt: "2026-11-14T04:21:09.123456+00:00",
      id: "42",
    });
  });

  it.each([
    undefined,
    "",
    "garbage",
    "2026-11-14|abc",
    "2026-11-14T04:21:09Z|1|2",
    "2026-11-14T04:21:09Z),or(id.gt.0|1", // PostgREST filter injection attempt
  ])("rejects %j", (raw) => {
    expect(parseCursor(raw)).toBeNull();
  });
});

describe("entryLabel", () => {
  it("describes where points came from", () => {
    expect(entryLabel({ kind: "redeem", refType: "order" })).toBe("Used at checkout");
    expect(entryLabel({ kind: "redeem", refType: "reward_redemption" })).toBe("Reward redeemed");
    expect(entryLabel({ kind: "earn", refType: "loyalty_account" })).toBe("Earned in store");
    expect(entryLabel({ kind: "signup", refType: "loyalty_account" })).toBe("Welcome bonus");
  });
});
