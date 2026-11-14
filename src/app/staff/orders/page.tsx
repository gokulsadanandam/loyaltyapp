import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { OrderStatusBadge } from "@/app/(shop)/orders/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { canRefund, getMerchantOrders, requireStaff } from "@/lib/data/staff";
import { formatDateTime, formatPaise, formatPoints, shortOrderId } from "@/lib/format";
import { cn } from "@/lib/utils";

import { OrderActions } from "./order-actions";

export const metadata: Metadata = { title: "Orders" };

const TABS = [
  { value: "pending", label: "Awaiting pickup" },
  { value: "fulfilled", label: "Completed" },
  { value: "all", label: "All" },
] as const;
type Tab = (typeof TABS)[number]["value"];

export default function StaffOrdersPage(props: PageProps<"/staff/orders">) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Orders searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Orders({ searchParams }: Pick<PageProps<"/staff/orders">, "searchParams">) {
  const ctx = await requireStaff("/staff/orders");
  const { status } = await searchParams;
  const tab: Tab = TABS.some((t) => t.value === status) ? (status as Tab) : "pending";
  const orders = await getMerchantOrders(ctx, tab);
  const refundAllowed = canRefund(ctx.role);

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Order status" className="flex w-fit gap-1 rounded-lg bg-muted p-1 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/staff/orders?status=${t.value}`}
            aria-current={t.value === tab ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5",
              t.value === tab ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <p className="text-muted-foreground">No orders here.</p>
      ) : (
        <ul className="divide-y rounded-xl border" aria-label="Orders">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              data-testid={`staff-order-${order.id}`}
            >
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium">#{shortOrderId(order.id)}</span>
                  <OrderStatusBadge status={order.status} />
                </div>
                <span className="text-sm">
                  {order.customerName}
                  {order.memberCode ? (
                    <span className="font-mono text-muted-foreground"> · {order.memberCode}</span>
                  ) : null}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatDateTime(order.createdAt)} · {order.itemCount}{" "}
                  {order.itemCount === 1 ? "item" : "items"}
                  {order.storeName ? ` · ${order.storeName}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right text-sm">
                  <p className="font-semibold tabular-nums">
                    Collect {formatPaise(order.totalPaise)}
                  </p>
                  {order.pointsRedeemed > 0 ? (
                    <p className="text-muted-foreground">
                      {formatPoints(order.pointsRedeemed)} used
                    </p>
                  ) : null}
                  {order.pointsEarned > 0 ? (
                    <p className="text-muted-foreground">
                      {formatPoints(order.pointsEarned)} earned
                    </p>
                  ) : null}
                </div>
                <OrderActions
                  orderId={order.id}
                  status={order.status}
                  refundAllowed={refundAllowed}
                  label={`#${shortOrderId(order.id)}`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
