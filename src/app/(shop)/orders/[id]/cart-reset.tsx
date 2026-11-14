"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { cartKeys } from "@/lib/cart-client";

/** place_order empties the cart server-side; sync the browser cache to match. */
export function CartReset() {
  const queryClient = useQueryClient();
  useEffect(() => {
    queryClient.setQueryData(cartKeys.cart, []);
    void queryClient.invalidateQueries({ queryKey: cartKeys.cart });
  }, [queryClient]);
  return null;
}
