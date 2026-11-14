import { AwardIcon, CoinsIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import { displayName, getAccountSummary } from "@/lib/data/account";
import { getMerchantRules } from "@/lib/data/catalog";
import { getRecentOrders } from "@/lib/data/orders";
import { env } from "@/lib/env";
import { formatDate, formatDateTime, formatPaise, formatPoints, shortOrderId } from "@/lib/format";
import { tierProgress } from "@/lib/points";

import { OrderStatusBadge } from "../orders/status-badge";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage(props: PageProps<"/account">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Account searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Account({ searchParams }: Pick<PageProps<"/account">, "searchParams">) {
  await requireUser("/account");
  const [summary, rules, orders, query] = await Promise.all([
    getAccountSummary(),
    getMerchantRules(),
    getRecentOrders(),
    searchParams,
  ]);
  if (!summary) return null;

  const progress = tierProgress(summary.lifetimeEarned, rules.tiers);
  const pointsValue = formatPaise(summary.available * rules.pointValuePaise);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hi, {displayName(summary)}</h1>
        <p className="text-sm text-muted-foreground">{summary.email}</p>
      </div>

      {query.password === "updated" ? (
        <Alert role="status">
          <AlertDescription>Your password has been updated.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <CoinsIcon className="size-4" aria-hidden /> Points balance
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {summary.available.toLocaleString("en-IN")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
            <p>Worth {pointsValue} at checkout.</p>
            {summary.expiringSoon > 0 && summary.nextExpiryAt ? (
              <p className="text-amber-700 dark:text-amber-400" data-testid="expiring-soon">
                {formatPoints(summary.expiringSoon)} expire by {formatDate(summary.nextExpiryAt)}.
              </p>
            ) : null}
            <Link href="/account/points" className="text-foreground underline underline-offset-4">
              Points history
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <AwardIcon className="size-4" aria-hidden /> Tier
            </CardDescription>
            <CardTitle className="text-3xl">{summary.tier?.name ?? "Member"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {summary.tier ? (
              <p className="text-muted-foreground">
                Earning {summary.tier.multiplierBps / 10_000}× points.
              </p>
            ) : null}
            {progress ? (
              <>
                <Progress
                  value={progress.percent}
                  aria-label={`Progress to ${progress.next.name}`}
                />
                <p className="text-muted-foreground">
                  {formatPoints(progress.pointsNeeded)} more lifetime points to {progress.next.name}
                  .
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">You&apos;re at the top tier.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Member code</CardDescription>
            <CardTitle className="font-mono text-2xl tracking-wider" data-testid="member-code">
              {summary.memberCode}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
            <p>Show this at the counter to earn in store.</p>
            <p>
              Invite friends:{" "}
              <span className="font-mono break-all text-foreground">
                {env.NEXT_PUBLIC_SITE_URL}/signup?ref={summary.referralCode}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="orders-heading" className="flex flex-col gap-3">
        <h2 id="orders-heading" className="text-lg font-semibold">
          Recent orders
        </h2>
        {orders.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
            <p className="text-sm text-muted-foreground">No orders yet.</p>
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              Start shopping
            </Link>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className="flex items-center justify-between gap-4 p-4 hover:bg-muted/50"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">#{shortOrderId(order.id)}</span>
                    <span className="text-sm text-muted-foreground">
                      {formatDateTime(order.createdAt)} · {order.itemCount}{" "}
                      {order.itemCount === 1 ? "item" : "items"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums">{formatPaise(order.totalPaise)}</span>
                    <OrderStatusBadge status={order.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
