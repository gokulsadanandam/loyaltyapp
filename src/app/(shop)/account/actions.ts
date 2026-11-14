"use server";

import QRCode from "qrcode";

import { getAccountSummary } from "@/lib/data/account";
import type { ActionResult } from "@/lib/errors";
import { issueMemberToken } from "@/lib/member-token";
import { qrSecret } from "@/lib/server-env";

/** A fresh, short-lived QR token for the signed-in member (never for anyone else). */
export async function getMemberQr(): Promise<ActionResult<{ token: string; image: string }>> {
  const summary = await getAccountSummary();
  if (!summary) return { ok: false, error: "Please sign in to continue." };
  const token = issueMemberToken(qrSecret(), summary.memberCode);
  const image = await QRCode.toDataURL(token, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });
  return { ok: true, data: { token, image } };
}
