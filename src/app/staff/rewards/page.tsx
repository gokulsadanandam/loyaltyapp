import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { setRewardActive } from "@/app/staff/catalog/actions";
import { ActiveToggle } from "@/app/staff/catalog/active-toggle";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getReferralSettings, listRewards } from "@/lib/data/admin-catalog";
import { requireStaff } from "@/lib/data/staff";
import { formatDate, formatPoints } from "@/lib/format";

import { ReferralSettingsForm } from "./referral-settings-form";

export const metadata: Metadata = { title: "Rewards" };

export default function StaffRewardsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Rewards</h1>
        <Link href="/staff/rewards/new" className={buttonVariants()}>
          <PlusIcon aria-hidden />
          New reward
        </Link>
      </div>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Rewards />
      </Suspense>
    </div>
  );
}

async function Rewards() {
  const ctx = await requireStaff("/staff/rewards", ["owner", "admin"]);
  const [rewards, referral] = await Promise.all([listRewards(ctx), getReferralSettings(ctx)]);

  return (
    <div className="flex flex-col gap-8">
      {rewards.length === 0 ? (
        <p className="text-muted-foreground">No rewards yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border" aria-label="Rewards">
          {rewards.map((r) => {
            const ended = r.ends_at !== null && new Date(r.ends_at) <= new Date();
            return (
              <li key={r.id} className="flex items-center gap-4 p-3" data-testid={`reward-${r.id}`}>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/staff/rewards/${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                    {!r.active ? <Badge variant="outline">Hidden</Badge> : null}
                    {ended ? <Badge variant="outline">Ended</Badge> : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatPoints(r.points_cost)}
                    {r.stock === null ? " · unlimited" : ` · ${String(r.stock)} left`}
                    {r.ends_at ? ` · until ${formatDate(r.ends_at)}` : ""}
                  </span>
                </div>
                <ActiveToggle id={r.id} active={r.active} name={r.name} action={setRewardActive} />
              </li>
            );
          })}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Referral programme</CardTitle>
          <CardDescription>
            Paid once per referred member, when their first order at or above the minimum is
            completed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReferralSettingsForm settings={referral} editable={ctx.role === "owner"} />
        </CardContent>
      </Card>
    </div>
  );
}
