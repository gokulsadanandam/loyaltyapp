import { CircleCheckBigIcon, MapPinIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import { getOrder } from "@/lib/data/orders";
import { formatDateTime, formatPaise, formatPoints, shortOrderId } from "@/lib/format";

import { OrderStatusBadge } from "../status-badge";
import { CartReset } from "./cart-reset";

export const metadata: Metadata = { title: "Order" };

export default function OrderPage(props: PageProps<"/orders/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Order params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Order({
  params,
  searchParams,
}: Pick<PageProps<"/orders/[id]">, "params" | "searchParams">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  await requireUser(`/orders/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const order = await getOrder(id);
  if (!order) notFound();
  const justPlaced = query.placed === "1";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {justPlaced ? (
        <>
          <CartReset />
          <div className="flex flex-col items-center gap-2 text-center" role="status">
            <CircleCheckBigIcon className="size-12 text-emerald-600" aria-hidden />
            <h1 className="text-2xl font-semibold tracking-tight">Order placed</h1>
            <p className="text-muted-foreground">
              Collect and pay at {order.store?.name ?? "the store"}. Your points are added when the
              store completes the order.
            </p>
          </div>
        </>
      ) : (
        <h1 className="text-2xl font-semibold tracking-tight">Order {shortOrderId(order.id)}</h1>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>#{shortOrderId(order.id)}</CardTitle>
            <p className="text-sm text-muted-foreground">{formatDateTime(order.createdAt)}</p>
          </div>
          <OrderStatusBadge status={order.status} />
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {order.store ? (
            <p className="flex items-start gap-2">
              <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">{order.store.name}</span>
                <span className="block text-muted-foreground">
                  {order.store.addressLine}, {order.store.city}
                </span>
              </span>
            </p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span>
                  {item.qty} × {item.name}
                </span>
                <span className="tabular-nums">{formatPaise(item.lineTotalPaise)}</span>
              </li>
            ))}
          </ul>
          <Separator />
          <Line label="Subtotal" value={formatPaise(order.subtotalPaise)} />
          {order.pointsRedeemed > 0 ? (
            <Line
              label={`Points redeemed (${formatPoints(order.pointsRedeemed)})`}
              value={`−${formatPaise(order.pointsDiscountPaise)}`}
            />
          ) : null}
          <Line label="Total" value={formatPaise(order.totalPaise)} strong />
          {order.pointsEarned > 0 ? (
            <Badge variant="secondary" className="w-fit">
              Earned {formatPoints(order.pointsEarned)}
            </Badge>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Continue shopping
        </Link>
        <Link href="/account" className={buttonVariants({ variant: "ghost" })}>
          All orders
        </Link>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
