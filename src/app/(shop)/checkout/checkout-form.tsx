"use client";

import { LocateFixedIcon, MapPinIcon } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { placeOrder } from "@/app/(shop)/actions";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import type { Store } from "@/lib/data/catalog";
import type { ActionResult } from "@/lib/errors";
import { cartSubtotal, type CartLine } from "@/lib/data/cart";
import { formatPaise, formatPoints } from "@/lib/format";
import { maxRedeemablePoints, quoteCheckout, type EarnRule, type RedeemRule } from "@/lib/points";
import { createClient } from "@/lib/supabase/client";

interface Props {
  lines: CartLine[];
  stores: Store[];
  availablePoints: number;
  earnRule: EarnRule;
  redeemRule: RedeemRule;
}

export function CheckoutForm({ lines, stores, availablePoints, earnRule, redeemRule }: Props) {
  // One key per checkout visit: a double-click or retry replays the same order
  // instead of creating a second one (place_order is idempotent on this key).
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [storeId, setStoreId] = useState<string>(stores[0]?.id ?? "");
  const [distances, setDistances] = useState<Record<string, number> | null>(null);
  const [locating, setLocating] = useState(false);
  const [pointsInput, setPointsInput] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const subtotal = cartSubtotal(lines);
  const maxPoints = maxRedeemablePoints(subtotal, availablePoints, redeemRule);
  const requested = Number.parseInt(pointsInput, 10);
  const quote = quoteCheckout(
    subtotal,
    Number.isFinite(requested) ? requested : 0,
    availablePoints,
    earnRule,
    redeemRule,
  );
  const pointsInvalid = Number.isFinite(requested) && requested > maxPoints;

  const sortedStores = useMemo(() => {
    if (!distances) return stores;
    return [...stores].sort(
      (a, b) => (distances[a.id] ?? Infinity) - (distances[b.id] ?? Infinity),
    );
  }, [stores, distances]);

  // Location is a convenience only: the full store list always works, so a
  // denied permission never blocks checkout (the legacy app's bug).
  const locate = () => {
    if (!("geolocation" in navigator)) {
      toast.info("Location isn't available in this browser. Pick a store from the list.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void (async () => {
          const { data, error: rpcError } = await createClient().rpc("nearby_stores", {
            p_lat: pos.coords.latitude,
            p_lng: pos.coords.longitude,
            p_radius_m: 50_000,
          });
          setLocating(false);
          if (rpcError || data.length === 0) {
            toast.info("No stores within 50 km. Pick a store from the list.");
            return;
          }
          setDistances(Object.fromEntries(data.map((s) => [s.id, s.distance_m])));
          const nearest = data[0];
          if (nearest) setStoreId(nearest.id);
        })();
      },
      () => {
        setLocating(false);
        toast.info("Location permission denied. Pick a store from the list.");
      },
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const submit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!storeId) {
      setError("Choose a store for pickup.");
      return;
    }
    if (pointsInvalid) {
      setError(`You can use up to ${formatPoints(maxPoints)} on this order.`);
      return;
    }
    startTransition(async () => {
      // Success redirects to the order page, in which case there is no result to read.
      const result: ActionResult | undefined = await placeOrder({
        idempotencyKey,
        storeId,
        pointsToRedeem: quote.pointsRedeemed,
      });
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- undefined at runtime after redirect()
      if (result && !result.ok) setError(result.error);
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_22rem]" noValidate>
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Pickup store</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={locate} disabled={locating}>
              <LocateFixedIcon aria-hidden />
              {locating ? "Locating…" : "Nearest to me"}
            </Button>
          </CardHeader>
          <CardContent>
            <FieldSet>
              <FieldLegend className="sr-only">Pickup store</FieldLegend>
              <RadioGroup
                value={storeId}
                onValueChange={(v) => {
                  setStoreId(String(v));
                }}
                name="storeId"
              >
                {sortedStores.map((store) => {
                  const id = `store-${store.id}`;
                  const km = distances?.[store.id];
                  return (
                    <Field
                      key={store.id}
                      orientation="horizontal"
                      className="rounded-lg border p-3"
                    >
                      <RadioGroupItem value={store.id} id={id} />
                      <FieldLabel htmlFor={id} className="flex flex-1 flex-col items-start gap-0.5">
                        <span className="flex items-center gap-1 font-medium">
                          <MapPinIcon className="size-3.5" aria-hidden />
                          {store.name}
                          {km !== undefined ? (
                            <span className="font-normal text-muted-foreground">
                              · {(km / 1000).toFixed(1)} km
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {store.address_line}, {store.city}
                        </span>
                      </FieldLabel>
                    </Field>
                  );
                })}
              </RadioGroup>
            </FieldSet>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Use points</CardTitle>
          </CardHeader>
          <CardContent>
            <Field data-invalid={pointsInvalid || undefined}>
              <FieldLabel htmlFor="points">Points to redeem</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="points"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pointsInput}
                  onChange={(e) => {
                    setPointsInput(e.target.value.replace(/[^0-9]/g, ""));
                  }}
                  aria-invalid={pointsInvalid || undefined}
                  aria-describedby="points-help"
                  className="max-w-40 tabular-nums"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setPointsInput(String(maxPoints));
                  }}
                  disabled={maxPoints === 0}
                >
                  Use max
                </Button>
              </div>
              <FieldDescription id="points-help">
                You have {formatPoints(availablePoints)}. Up to {formatPoints(maxPoints)} on this
                order (1 pt = {formatPaise(redeemRule.pointValuePaise)}, max{" "}
                {redeemRule.maxRedeemBps / 100}% of the subtotal).
              </FieldDescription>
            </Field>
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Order summary</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <ul className="flex flex-col gap-2">
            {lines.map((line) => (
              <li key={line.productId} className="flex justify-between gap-3">
                <span className="line-clamp-1">
                  {line.qty} × {line.name}
                </span>
                <span className="tabular-nums">{formatPaise(line.salePricePaise * line.qty)}</span>
              </li>
            ))}
          </ul>
          <Separator />
          <Row label="Subtotal" value={formatPaise(quote.subtotalPaise)} />
          {quote.pointsRedeemed > 0 ? (
            <Row
              label={`Points (${formatPoints(quote.pointsRedeemed)})`}
              value={`−${formatPaise(quote.discountPaise)}`}
            />
          ) : null}
          <Separator />
          <Row label="Total" value={formatPaise(quote.totalPaise)} strong />
          <p className="text-muted-foreground">
            You&apos;ll earn <strong>{formatPoints(quote.pointsToEarn)}</strong> when you collect
            and pay at the store.
          </p>
          {error ? <FormMessage status="error" message={error} /> : null}
        </CardContent>
        <CardFooter>
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Placing order…" : `Place order · ${formatPaise(quote.totalPaise)}`}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
