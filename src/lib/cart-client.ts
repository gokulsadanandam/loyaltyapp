"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAccountRef, fetchCart, setCartQty, type CartLine } from "@/lib/data/cart";
import { createClient } from "@/lib/supabase/client";

export const cartKeys = {
  cart: ["cart"] as const,
  account: ["account-ref"] as const,
};

export class NotSignedInError extends Error {
  constructor() {
    super("not_authenticated");
  }
}

async function hasSession() {
  const { data } = await createClient().auth.getSession();
  return Boolean(data.session);
}

export function useCart(enabled = true) {
  return useQuery({
    queryKey: cartKeys.cart,
    queryFn: () => fetchCart(createClient()),
    enabled,
  });
}

function useAccountRef() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.query({
      queryKey: cartKeys.account,
      queryFn: () => fetchAccountRef(createClient()),
      staleTime: Infinity,
    });
}

export interface SetQtyInput {
  productId: string;
  qty: number;
  /** Product details for the optimistic line when adding something new. */
  product?: Omit<CartLine, "productId" | "qty"> | undefined;
}

/** Optimistically sets a line's quantity (0 removes it), rolling back on failure. */
export function useSetCartQty() {
  const queryClient = useQueryClient();
  const getAccount = useAccountRef();

  return useMutation({
    mutationFn: async ({ productId, qty }: SetQtyInput) => {
      if (!(await hasSession())) throw new NotSignedInError();
      await setCartQty(createClient(), await getAccount(), productId, qty);
    },
    onMutate: async ({ productId, qty, product }) => {
      await queryClient.cancelQueries({ queryKey: cartKeys.cart });
      const previous = queryClient.getQueryData<CartLine[]>(cartKeys.cart);
      if (previous) {
        const exists = previous.some((l) => l.productId === productId);
        let next: CartLine[];
        if (qty <= 0) next = previous.filter((l) => l.productId !== productId);
        else if (exists)
          next = previous.map((l) => (l.productId === productId ? { ...l, qty } : l));
        else next = product ? [...previous, { ...product, productId, qty }] : previous;
        queryClient.setQueryData(cartKeys.cart, next);
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(cartKeys.cart, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: cartKeys.cart }),
  });
}
