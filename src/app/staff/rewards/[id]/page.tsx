import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Skeleton } from "@/components/ui/skeleton";
import { getReward, listProducts } from "@/lib/data/admin-catalog";
import { requireStaff } from "@/lib/data/staff";

import { RewardForm } from "../reward-form";

export const metadata: Metadata = { title: "Edit reward" };

export default function EditRewardPage(props: PageProps<"/staff/rewards/[id]">) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit reward</h1>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <EditReward params={props.params} />
      </Suspense>
    </div>
  );
}

async function EditReward({ params }: Pick<PageProps<"/staff/rewards/[id]">, "params">) {
  const { id } = await params;
  const ctx = await requireStaff(`/staff/rewards/${id}`, ["owner", "admin"]);
  if (!z.uuid().safeParse(id).success) notFound();
  const [reward, products] = await Promise.all([getReward(ctx, id), listProducts(ctx)]);
  if (!reward) notFound();
  return (
    <RewardForm
      reward={reward}
      products={products.map((p) => ({ id: p.id, name: p.name, sku: p.sku }))}
    />
  );
}
