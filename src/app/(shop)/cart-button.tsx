"use client";

import { ShoppingCartIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { useCart } from "@/lib/cart-client";
import { cartCount } from "@/lib/data/cart";

export function CartButton() {
  const { data } = useCart();
  const count = data ? cartCount(data) : 0;
  return (
    <Link
      href="/cart"
      className={buttonVariants({ variant: "ghost", size: "icon", className: "relative" })}
      aria-label={count > 0 ? `Cart, ${String(count)} items` : "Cart, empty"}
    >
      <ShoppingCartIcon aria-hidden />
      {count > 0 ? (
        <span
          data-testid="cart-count"
          className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground tabular-nums"
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
