import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Price } from "@/components/price";
import { ProductImage } from "@/components/product-image";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listProducts } from "@/lib/data/admin-catalog";
import { requireStaff } from "@/lib/data/staff";

import { setProductActive } from "./actions";
import { ActiveToggle } from "./active-toggle";

export const metadata: Metadata = { title: "Catalog" };

export default function CatalogPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Catalog</h1>
        <Link href="/staff/catalog/new" className={buttonVariants()}>
          <PlusIcon aria-hidden />
          New product
        </Link>
      </div>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Products />
      </Suspense>
    </div>
  );
}

async function Products() {
  const ctx = await requireStaff("/staff/catalog", ["owner", "admin"]);
  const products = await listProducts(ctx);
  if (products.length === 0) return <p className="text-muted-foreground">No products yet.</p>;

  return (
    <ul className="divide-y rounded-xl border" aria-label="Products">
      {products.map((p) => (
        <li key={p.id} className="flex items-center gap-4 p-3" data-testid={`product-${p.sku}`}>
          <ProductImage path={p.image_path} alt="" sizes="56px" className="size-14 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <Link
                href={`/staff/catalog/${p.id}`}
                className="truncate font-medium hover:underline"
              >
                {p.name}
              </Link>
              {!p.active ? <Badge variant="outline">Hidden</Badge> : null}
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {p.sku} · {p.category}
            </span>
          </div>
          <Price
            salePaise={p.sale_price_paise}
            listPaise={p.list_price_paise}
            className="hidden text-sm sm:flex"
          />
          <ActiveToggle id={p.id} active={p.active} name={p.name} action={setProductActive} />
        </li>
      ))}
    </ul>
  );
}
