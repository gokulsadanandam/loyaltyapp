import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { issueMemberToken, verifyMemberToken } = await import("./member-token");

const SECRET = "test-secret-test-secret-test-secret-1234";
const T0 = Date.UTC(2026, 10, 14, 10, 0, 0);
const MIN = 60_000;

describe("member QR tokens", () => {
  it("round-trips to the member code", () => {
    const token = issueMemberToken(SECRET, "LYABC234DEF", T0);
    expect(token).toMatch(/^LQ1\.LYABC234DEF\.\d+\.[A-Za-z0-9_-]{16}$/);
    expect(verifyMemberToken(SECRET, token, T0)).toEqual({ ok: true, memberCode: "LYABC234DEF" });
  });

  it("accepts small clock skew, rejects screenshots older than ~2 minutes", () => {
    const token = issueMemberToken(SECRET, "LYABC234DEF", T0);
    expect(verifyMemberToken(SECRET, token, T0 + 2 * MIN).ok).toBe(true);
    expect(verifyMemberToken(SECRET, token, T0 - 2 * MIN).ok).toBe(true);
    expect(verifyMemberToken(SECRET, token, T0 + 3 * MIN)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects a token re-pointed at another member", () => {
    const token = issueMemberToken(SECRET, "LYABC234DEF", T0);
    const forged = token.replace("LYABC234DEF", "LYOTHER2345");
    expect(verifyMemberToken(SECRET, forged, T0)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a token moved forward in time", () => {
    const token = issueMemberToken(SECRET, "LYABC234DEF", T0);
    const [p, code, window, sig] = token.split(".");
    const replayed = [p, code, String(Number(window) + 5), sig].join(".");
    expect(verifyMemberToken(SECRET, replayed, T0 + 5 * MIN)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects tokens signed with a different secret", () => {
    const token = issueMemberToken("another-secret-another-secret-1234567", "LYABC234DEF", T0);
    expect(verifyMemberToken(SECRET, token, T0)).toEqual({ ok: false, reason: "invalid" });
  });

  it.each([
    "",
    "LYABC234DEF",
    "LQ1.lower.1.AAAAAAAAAAAAAAAA",
    "LQ1.LYABC234DEF.1.short",
    "LQ1..1.AAAAAAAAAAAAAAAA",
  ])("rejects malformed input %j", (value) => {
    expect(verifyMemberToken(SECRET, value, T0)).toEqual({ ok: false, reason: "malformed" });
  });
});
