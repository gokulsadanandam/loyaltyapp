import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { listProducts } from "@/lib/data/admin-catalog";
import { requireStaff } from "@/lib/data/staff";

import { RewardForm } from "../reward-form";

export const metadata: Metadata = { title: "New reward" };

export default function NewRewardPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New reward</h1>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <NewReward />
      </Suspense>
    </div>
  );
}

async function NewReward() {
  const ctx = await requireStaff("/staff/rewards/new", ["owner", "admin"]);
  const products = await listProducts(ctx);
  return <RewardForm products={products.map((p) => ({ id: p.id, name: p.name, sku: p.sku }))} />;
}
