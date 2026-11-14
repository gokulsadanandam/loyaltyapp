import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { getStores } from "@/lib/data/catalog";
import { requireStaff } from "@/lib/data/staff";

import { AwardForm } from "./award-form";

export const metadata: Metadata = { title: "Award points" };

export default function AwardPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Award points</h1>
        <p className="text-muted-foreground">For purchases made at the counter.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-80" />}>
        <Award />
      </Suspense>
    </div>
  );
}

async function Award() {
  await requireStaff("/staff/award");
  const stores = await getStores();
  return <AwardForm stores={stores} />;
}
