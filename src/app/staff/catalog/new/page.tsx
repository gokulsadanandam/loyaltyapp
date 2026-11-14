import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { requireStaff } from "@/lib/data/staff";

import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "New product" };

export default function NewProductPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New product</h1>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <NewProduct />
      </Suspense>
    </div>
  );
}

async function NewProduct() {
  const ctx = await requireStaff("/staff/catalog/new", ["owner", "admin"]);
  return <ProductForm merchantId={ctx.merchantId} />;
}
