/**
 * Client-side mirrors of the database's points rules, for previews only.
 * The database is authoritative: place_order / fulfill_order recompute everything.
 * Keep in sync with private.points_for_spend and public.place_order (migration 0700).
 */

export interface EarnRule {
  /** Merchant earn rate in basis points of spend (1000 = 10%). */
  earnRateBps: number;
  /** Tier multiplier in basis points (10000 = 1x). */
  multiplierBps: number;
}

export interface RedeemRule {
  /** Value of one point in paise. */
  pointValuePaise: number;
  /** Max share of the subtotal payable with points, in basis points (5000 = 50%). */
  maxRedeemBps: number;
}

const BPS = 10_000n;

/** floor(paise × earn_rate_bps × multiplier_bps / 10^10), in BigInt to avoid float drift. */
export function pointsForSpend(amountPaise: number, rule: EarnRule): number {
  if (amountPaise <= 0) return 0;
  const points =
    (BigInt(Math.trunc(amountPaise)) * BigInt(rule.earnRateBps) * BigInt(rule.multiplierBps)) /
    (BPS * BPS * 100n);
  return Number(points);
}

/** Largest point redemption place_order will accept for this subtotal and balance. */
export function maxRedeemablePoints(
  subtotalPaise: number,
  availablePoints: number,
  rule: RedeemRule,
): number {
  if (subtotalPaise <= 0 || availablePoints <= 0 || rule.pointValuePaise <= 0) return 0;
  const capPaise = Math.floor((subtotalPaise * rule.maxRedeemBps) / 10_000);
  return Math.max(0, Math.min(availablePoints, Math.floor(capPaise / rule.pointValuePaise)));
}

export interface CheckoutQuote {
  subtotalPaise: number;
  pointsRedeemed: number;
  discountPaise: number;
  totalPaise: number;
  pointsToEarn: number;
}

/** Totals exactly as place_order + fulfill_order will compute them. */
export function quoteCheckout(
  subtotalPaise: number,
  requestedPoints: number,
  availablePoints: number,
  earn: EarnRule,
  redeem: RedeemRule,
): CheckoutQuote {
  const max = maxRedeemablePoints(subtotalPaise, availablePoints, redeem);
  const pointsRedeemed = Math.max(0, Math.min(Math.trunc(requestedPoints) || 0, max));
  const discountPaise = pointsRedeemed * redeem.pointValuePaise;
  const totalPaise = subtotalPaise - discountPaise;
  return {
    subtotalPaise,
    pointsRedeemed,
    discountPaise,
    totalPaise,
    pointsToEarn: pointsForSpend(totalPaise, earn),
  };
}

export interface TierLike {
  name: string;
  minLifetimePoints: number;
}

/** Next tier above `lifetimeEarned`, and progress toward it (0–100). Null at the top tier. */
export function tierProgress(lifetimeEarned: number, tiers: readonly TierLike[]) {
  const sorted = [...tiers].sort((a, b) => a.minLifetimePoints - b.minLifetimePoints);
  const next = sorted.find((t) => t.minLifetimePoints > lifetimeEarned);
  if (!next) return null;
  const current = sorted.filter((t) => t.minLifetimePoints <= lifetimeEarned).at(-1);
  const floor = current?.minLifetimePoints ?? 0;
  const span = next.minLifetimePoints - floor;
  return {
    next,
    pointsNeeded: next.minLifetimePoints - lifetimeEarned,
    percent: span > 0 ? Math.min(100, Math.round(((lifetimeEarned - floor) / span) * 100)) : 100,
  };
}
