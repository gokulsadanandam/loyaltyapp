import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getMerchantAnalytics, percent, RANGES, type Range } from "@/lib/data/analytics";
import { requireStaff } from "@/lib/data/staff";
import { formatPaise, formatPoints } from "@/lib/format";
import { cn } from "@/lib/utils";

import { PointsChart } from "./points-chart";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage(props: PageProps<"/staff/analytics">) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
      <Suspense fallback={<Skeleton className="h-[40rem]" />}>
        <Dashboard searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/staff/analytics">, "searchParams">) {
  await requireStaff("/staff/analytics", ["owner", "admin"]);
  const { days: raw } = await searchParams;
  const days: Range = RANGES.find((r) => String(r) === raw) ?? 30;
  const a = await getMerchantAnalytics(days);

  const redemptionRate = percent(a.points.lifetime_redeemed, a.points.lifetime_issued);
  const repeatRate = percent(a.repeat.repeat_buyers, a.repeat.buyers);
  const tierTotal = a.tiers.reduce((sum, t) => sum + t.members, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Filters: one row, above the charts. */}
      <nav aria-label="Date range" className="flex w-fit gap-1 rounded-lg bg-muted p-1 text-sm">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/staff/analytics?days=${String(r)}`}
            aria-current={r === days ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5",
              r === days ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
            )}
          >
            Last {r} days
          </Link>
        ))}
      </nav>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Key figures">
        <Stat
          label="Points owed to members"
          value={formatPaise(a.liability.paise)}
          detail={`${formatPoints(a.liability.points)} spendable now`}
          testId="kpi-liability"
        />
        <Stat
          label="Redemption rate"
          value={`${String(redemptionRate)}%`}
          detail={`${formatPoints(a.points.lifetime_redeemed)} of ${formatPoints(a.points.lifetime_issued)} issued, all time`}
          testId="kpi-redemption"
        />
        <Stat
          label="Active members"
          value={a.members.active.toLocaleString("en-IN")}
          detail={`of ${a.members.total.toLocaleString("en-IN")} · ${a.members.new.toLocaleString("en-IN")} new in ${String(days)} days`}
          testId="kpi-active"
        />
        <Stat
          label={`Revenue, last ${String(days)} days`}
          value={formatPaise(a.orders.revenue_paise)}
          detail={`${a.orders.fulfilled.toLocaleString("en-IN")} completed orders · ${formatPaise(a.orders.avg_order_paise)} average`}
          testId="kpi-revenue"
        />
      </dl>

      <Card>
        <CardHeader>
          <CardTitle>Points issued and redeemed</CardTitle>
          <CardDescription>
            {formatPoints(a.points.issued)} issued, {formatPoints(a.points.redeemed)} redeemed and{" "}
            {formatPoints(a.points.expired)} expired in the last {days} days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PointsChart data={a.daily} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Members by tier</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3" aria-label="Members by tier">
              {a.tiers.map((t) => {
                const share = percent(t.members, tierTotal);
                return (
                  <li key={t.name} className="flex flex-col gap-1">
                    <div className="flex justify-between text-sm">
                      <span>{t.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {t.members.toLocaleString("en-IN")} · {share}%
                      </span>
                    </div>
                    {/* Meter: same-hue track, one hue for every row (sequential, not identity). */}
                    <div
                      className="h-2 overflow-hidden rounded-full"
                      style={{
                        background: "color-mix(in oklch, var(--viz-series-1), transparent 82%)",
                      }}
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={share}
                      aria-label={`${t.name}: ${String(share)}% of members`}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${String(share)}%`, background: "var(--viz-series-1)" }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Repeat customers</CardTitle>
            <CardDescription>Members with two or more completed orders, all time.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p className="text-4xl font-semibold tabular-nums" data-testid="kpi-repeat">
              {repeatRate}%
            </p>
            <p className="text-sm text-muted-foreground">
              {a.repeat.repeat_buyers.toLocaleString("en-IN")} of{" "}
              {a.repeat.buyers.toLocaleString("en-IN")} buyers came back.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  testId,
}: {
  label: string;
  value: string;
  detail: string;
  testId: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="text-2xl font-semibold tabular-nums" data-testid={testId}>
          {value}
        </dd>
        <dd className="text-xs text-muted-foreground">{detail}</dd>
      </CardContent>
    </Card>
  );
}
