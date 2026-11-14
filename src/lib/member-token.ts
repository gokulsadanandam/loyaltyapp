import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Rotating member QR tokens: `LQ1.<memberCode>.<window>.<sig>`.
 *
 * - window = floor(unix seconds / 60). A token verifies within ±MAX_SKEW windows,
 *   so a screenshot stops working after about two minutes.
 * - sig = first 16 base64url chars (96 bits) of HMAC-SHA256(secret, "LQ1.<code>.<window>").
 * - The token only identifies the member for staff; it grants nothing by itself.
 *   Awards still go through staff_award_points with the staff member's session.
 */

const PREFIX = "LQ1";
const WINDOW_SECONDS = 60;
const MAX_SKEW = 2;
const TOKEN = /^LQ1\.([A-Z0-9]{4,20})\.(\d{1,12})\.([A-Za-z0-9_-]{16})$/;

function sign(secret: string, code: string, window: number): string {
  return createHmac("sha256", secret)
    .update(`${PREFIX}.${code}.${String(window)}`)
    .digest("base64url")
    .slice(0, 16);
}

export function currentWindow(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / WINDOW_SECONDS);
}

export function issueMemberToken(secret: string, memberCode: string, nowMs = Date.now()): string {
  const window = currentWindow(nowMs);
  return `${PREFIX}.${memberCode}.${String(window)}.${sign(secret, memberCode, window)}`;
}

export function looksLikeMemberToken(value: string): boolean {
  return value.startsWith(`${PREFIX}.`);
}

export type TokenCheck =
  { ok: true; memberCode: string } | { ok: false; reason: "malformed" | "expired" | "invalid" };

export function verifyMemberToken(secret: string, token: string, nowMs = Date.now()): TokenCheck {
  const match = TOKEN.exec(token.trim());
  if (!match) return { ok: false, reason: "malformed" };
  const [, code = "", windowText = "", sig = ""] = match;
  const window = Number(windowText);

  const expected = Buffer.from(sign(secret, code, window));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "invalid" };
  }
  if (Math.abs(currentWindow(nowMs) - window) > MAX_SKEW) return { ok: false, reason: "expired" };
  return { ok: true, memberCode: code };
}
