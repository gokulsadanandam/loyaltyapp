import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Skeleton } from "@/components/ui/skeleton";
import { getProduct } from "@/lib/data/admin-catalog";
import { requireStaff } from "@/lib/data/staff";

import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Edit product" };

export default function EditProductPage(props: PageProps<"/staff/catalog/[id]">) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit product</h1>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <EditProduct params={props.params} />
      </Suspense>
    </div>
  );
}

async function EditProduct({ params }: Pick<PageProps<"/staff/catalog/[id]">, "params">) {
  const { id } = await params;
  const ctx = await requireStaff(`/staff/catalog/${id}`, ["owner", "admin"]);
  if (!z.uuid().safeParse(id).success) notFound();
  const product = await getProduct(ctx, id);
  if (!product) notFound();
  return <ProductForm merchantId={ctx.merchantId} product={product} />;
}
