import { describe, expect, it } from "vitest";

import { maxRedeemablePoints, pointsForSpend, quoteCheckout, tierProgress } from "./points";

const base = { earnRateBps: 1000, multiplierBps: 10_000 };
const redeem = { pointValuePaise: 25, maxRedeemBps: 5000 };

describe("pointsForSpend (mirrors private.points_for_spend)", () => {
  it("earns 10% of the rupee amount, floored", () => {
    // Same figures as supabase/tests/database/04: ₹1,195 → 119 points.
    expect(pointsForSpend(119_500, base)).toBe(119);
    expect(pointsForSpend(50_000, base)).toBe(50);
    expect(pointsForSpend(999, base)).toBe(0);
  });

  it("applies the tier multiplier", () => {
    expect(pointsForSpend(100_000, { earnRateBps: 1000, multiplierBps: 12_500 })).toBe(125);
    expect(pointsForSpend(100_000, { earnRateBps: 1000, multiplierBps: 15_000 })).toBe(150);
  });

  it("is exact for amounts beyond float precision", () => {
    // 10^12 paise × 1000 × 50000 overflows 2^53 as a float product.
    expect(pointsForSpend(1e12, { earnRateBps: 1000, multiplierBps: 50_000 })).toBe(5_000_000_000);
  });

  it("never returns negative points", () => {
    expect(pointsForSpend(0, base)).toBe(0);
    expect(pointsForSpend(-500, base)).toBe(0);
  });
});

describe("maxRedeemablePoints (mirrors place_order limits)", () => {
  it("caps at 50% of the subtotal", () => {
    // ₹1,200 subtotal → ₹600 cap → 2,400 points.
    expect(maxRedeemablePoints(120_000, 10_000, redeem)).toBe(2400);
  });

  it("caps at the available balance", () => {
    expect(maxRedeemablePoints(120_000, 100, redeem)).toBe(100);
  });

  it("floors the cap so the discount never exceeds it", () => {
    // ₹1.99 subtotal → 99.5 paise cap → 3 points (75 paise), not 4 (100 paise).
    expect(maxRedeemablePoints(199, 1000, redeem)).toBe(3);
  });

  it("is zero with no balance or empty cart", () => {
    expect(maxRedeemablePoints(0, 100, redeem)).toBe(0);
    expect(maxRedeemablePoints(10_000, 0, redeem)).toBe(0);
  });
});

describe("quoteCheckout", () => {
  it("matches the database for the pgTAP fixture order", () => {
    expect(quoteCheckout(120_000, 20, 100, base, redeem)).toEqual({
      subtotalPaise: 120_000,
      pointsRedeemed: 20,
      discountPaise: 500,
      totalPaise: 119_500,
      pointsToEarn: 119,
    });
  });

  it("clamps requested points into the allowed range", () => {
    expect(quoteCheckout(120_000, 5000, 100, base, redeem).pointsRedeemed).toBe(100);
    expect(quoteCheckout(120_000, -5, 100, base, redeem).pointsRedeemed).toBe(0);
    expect(quoteCheckout(120_000, Number.NaN, 100, base, redeem).pointsRedeemed).toBe(0);
  });
});

describe("tierProgress", () => {
  const tiers = [
    { name: "Silver", minLifetimePoints: 0 },
    { name: "Gold", minLifetimePoints: 2000 },
    { name: "Platinum", minLifetimePoints: 10_000 },
  ];

  it("reports the next tier and progress", () => {
    expect(tierProgress(500, tiers)).toEqual({ next: tiers[1], pointsNeeded: 1500, percent: 25 });
    expect(tierProgress(6000, tiers)).toEqual({ next: tiers[2], pointsNeeded: 4000, percent: 50 });
  });

  it("is null at the top tier", () => {
    expect(tierProgress(10_000, tiers)).toBeNull();
  });
});
