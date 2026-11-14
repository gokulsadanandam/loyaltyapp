import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import { getAccountSummary } from "@/lib/data/account";
import { getMerchantRules } from "@/lib/data/catalog";

import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Cart" };

export default function CartPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your cart</h1>
      <Suspense fallback={<Skeleton className="h-72" />}>
        <Cart />
      </Suspense>
    </div>
  );
}

async function Cart() {
  await requireUser("/cart");
  const [summary, rules] = await Promise.all([getAccountSummary(), getMerchantRules()]);
  return (
    <CartView
      earnRule={{
        earnRateBps: rules.earnRateBps,
        multiplierBps: summary?.tier?.multiplierBps ?? 10_000,
      }}
      tierName={summary?.tier?.name ?? null}
    />
  );
}
