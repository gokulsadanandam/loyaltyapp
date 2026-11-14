"use client";

import { MinusIcon, PlusIcon, ShoppingBagIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Price } from "@/components/price";
import { ProductImage } from "@/components/product-image";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart, useSetCartQty } from "@/lib/cart-client";
import { cartSubtotal, MAX_LINE_QTY, type CartLine } from "@/lib/data/cart";
import { formatPaise, formatPoints } from "@/lib/format";
import { pointsForSpend, type EarnRule } from "@/lib/points";

export function CartView({ earnRule, tierName }: { earnRule: EarnRule; tierName: string | null }) {
  const { data: lines, isPending, isError, refetch } = useCart();

  if (isPending) return <Skeleton className="h-72" />;
  if (isError) {
    return (
      <div className="flex flex-col items-start gap-3" role="alert">
        <p>We couldn&apos;t load your cart.</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16 text-center">
        <ShoppingBagIcon className="size-10 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Your cart is empty.</p>
        <Link href="/" className={buttonVariants()}>
          Browse products
        </Link>
      </div>
    );
  }

  const subtotal = cartSubtotal(lines);
  const unavailable = lines.some((l) => !l.active);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <ul className="flex flex-col divide-y rounded-xl border" aria-label="Cart items">
        {lines.map((line) => (
          <CartRow key={line.productId} line={line} />
        ))}
      </ul>
      <Card className="h-fit lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="font-medium tabular-nums">{formatPaise(subtotal)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>You&apos;ll earn{tierName ? ` (${tierName})` : ""}</span>
            <span className="tabular-nums">
              up to {formatPoints(pointsForSpend(subtotal, earnRule))}
            </span>
          </div>
          <Separator />
          <p className="text-xs text-muted-foreground">
            Apply points and choose a pickup store at checkout.
          </p>
        </CardContent>
        <CardFooter>
          {unavailable ? (
            <p className="text-sm text-destructive" role="alert">
              Remove unavailable items to continue.
            </p>
          ) : (
            <Link href="/checkout" className={buttonVariants({ size: "lg", className: "w-full" })}>
              Checkout
            </Link>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

function CartRow({ line }: { line: CartLine }) {
  const setQty = useSetCartQty();
  const update = (qty: number) => {
    setQty.mutate(
      { productId: line.productId, qty },
      { onError: () => toast.error("Couldn't update your cart. Please try again.") },
    );
  };

  return (
    <li className="flex gap-4 p-4">
      <Link href={`/products/${line.sku}`} className="shrink-0" tabIndex={-1} aria-hidden>
        <ProductImage path={line.imagePath} alt="" sizes="80px" className="size-20" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/products/${line.sku}`} className="line-clamp-2 font-medium hover:underline">
            {line.name}
          </Link>
          <span className="font-medium whitespace-nowrap tabular-nums">
            {formatPaise(line.salePricePaise * line.qty)}
          </span>
        </div>
        <Price
          salePaise={line.salePricePaise}
          listPaise={line.listPricePaise}
          className="text-sm"
        />
        {!line.active ? <p className="text-sm text-destructive">No longer available</p> : null}
        <div className="mt-auto flex items-center gap-2">
          <div
            className="flex items-center rounded-lg border"
            role="group"
            aria-label={`Quantity for ${line.name}`}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Decrease quantity"
              disabled={line.qty <= 1}
              onClick={() => {
                update(line.qty - 1);
              }}
            >
              <MinusIcon aria-hidden />
            </Button>
            <output className="w-8 text-center text-sm tabular-nums" aria-live="polite">
              {line.qty}
            </output>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Increase quantity"
              disabled={line.qty >= MAX_LINE_QTY}
              onClick={() => {
                update(line.qty + 1);
              }}
            >
              <PlusIcon aria-hidden />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              update(0);
            }}
          >
            <Trash2Icon aria-hidden />
            Remove
          </Button>
        </div>
      </div>
    </li>
  );
}
