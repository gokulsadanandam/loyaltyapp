import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import { getAccountSummary } from "@/lib/data/account";
import { fetchCart } from "@/lib/data/cart";
import { getMerchantRules, getStores } from "@/lib/data/catalog";
import { createClient } from "@/lib/supabase/server";

import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "Checkout" };

export default function CheckoutPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Checkout />
      </Suspense>
    </div>
  );
}

async function Checkout() {
  await requireUser("/checkout");
  const supabase = await createClient();
  const [summary, lines, stores, rules] = await Promise.all([
    getAccountSummary(),
    fetchCart(supabase),
    getStores(),
    getMerchantRules(),
  ]);

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted-foreground">Your cart is empty.</p>
        <Link href="/" className={buttonVariants()}>
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <CheckoutForm
      lines={lines}
      stores={stores}
      availablePoints={summary?.balance ?? 0}
      earnRule={{
        earnRateBps: rules.earnRateBps,
        multiplierBps: summary?.tier?.multiplierBps ?? 10_000,
      }}
      redeemRule={{ pointValuePaise: rules.pointValuePaise, maxRedeemBps: rules.maxRedeemBps }}
    />
  );
}
