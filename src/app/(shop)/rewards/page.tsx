import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { getAccountSummary } from "@/lib/data/account";
import { getRewards, isRewardLive } from "@/lib/data/catalog";

import { RewardCard } from "./reward-card";

export const metadata: Metadata = { title: "Rewards" };

export default function RewardsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Rewards</h1>
        <p className="text-muted-foreground">Spend your points on perks and products.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <RewardList />
      </Suspense>
    </div>
  );
}

async function RewardList() {
  await connection(); // the live window depends on the current time
  const [rewards, summary] = await Promise.all([getRewards(), getAccountSummary()]);
  const now = new Date();
  const live = rewards.filter((r) => isRewardLive(r, now));

  if (live.length === 0) {
    return <p className="text-muted-foreground">No rewards right now. Check back soon.</p>;
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {live.map((reward) => (
        <li key={reward.id}>
          <RewardCard reward={reward} balance={summary ? summary.available : null} />
        </li>
      ))}
    </ul>
  );
}
