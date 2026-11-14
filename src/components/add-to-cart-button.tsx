"use client";

import { PlusIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { NotSignedInError, useCart, useSetCartQty } from "@/lib/cart-client";
import { MAX_LINE_QTY, type CartLine } from "@/lib/data/cart";

type ProductForCart = Omit<CartLine, "qty">;

export function AddToCartButton({
  product,
  size = "default",
}: {
  product: ProductForCart;
  size?: "default" | "lg";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: cart } = useCart();
  const setQty = useSetCartQty();
  const current = cart?.find((l) => l.productId === product.productId)?.qty ?? 0;
  const atLimit = current >= MAX_LINE_QTY;

  const add = () => {
    const { productId, ...details } = product;
    setQty.mutate(
      { productId, qty: current + 1, product: details },
      {
        onSuccess: () => {
          toast.success(`Added ${product.name} to your cart`, {
            action: {
              label: "View cart",
              onClick: () => {
                router.push("/cart");
              },
            },
          });
        },
        onError: (error) => {
          if (error instanceof NotSignedInError) {
            router.push(`/login?next=${encodeURIComponent(pathname)}`);
            return;
          }
          toast.error("Couldn't add that to your cart. Please try again.");
        },
      },
    );
  };

  return (
    <Button size={size} onClick={add} disabled={atLimit || setQty.isPending}>
      <PlusIcon aria-hidden />
      {atLimit
        ? "Limit reached"
        : current > 0
          ? `Add another (${String(current)} in cart)`
          : "Add to cart"}
    </Button>
  );
}
