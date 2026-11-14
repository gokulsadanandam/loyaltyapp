/**
 * The database raises stable identifiers as the error message (see README:
 * "RPC error contract"). This maps them to copy a customer can act on.
 */
const MESSAGES: Record<string, string> = {
  not_authenticated: "Please sign in to continue.",
  forbidden: "You don't have permission to do that.",
  account_not_found: "We couldn't find your loyalty account. Please contact support.",
  cart_empty: "Your cart is empty.",
  product_unavailable:
    "An item in your cart is no longer available. Please remove it and try again.",
  store_not_found: "That store isn't available any more. Please pick another.",
  fulfilment_target_required: "Choose a store for pickup.",
  invalid_shipping_address: "Please check your delivery address.",
  insufficient_points: "You don't have enough points for that.",
  redeem_limit_exceeded: "Points can cover at most half of your order.",
  invalid_points: "Enter a valid number of points.",
  reward_unavailable: "This reward isn't available right now.",
  reward_out_of_stock: "This reward is out of stock.",
  idempotency_key_reused:
    "That request was already used for something else. Please refresh and try again.",
  idempotency_key_required: "Something went wrong. Please refresh and try again.",
};

const FALLBACK = "Something went wrong. Please try again.";

export interface DbError {
  code?: string | undefined;
  message?: string | undefined;
}

/** Stable identifier for logging/tests, e.g. "insufficient_points". */
export function errorCode(error: DbError | null | undefined): string {
  return error?.message?.trim() ?? "unknown";
}

export function userMessage(error: DbError | null | undefined): string {
  const code = errorCode(error);
  if (Object.hasOwn(MESSAGES, code)) return MESSAGES[code] ?? FALLBACK;
  if (error?.code === "42501") return MESSAGES.forbidden ?? FALLBACK;
  return FALLBACK;
}

/** Result shape every Server Action returns, so the client never sees raw DB errors. */
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
