import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AddToCartButton } from "@/components/add-to-cart-button";
import { Price } from "@/components/price";
import { ProductImage } from "@/components/product-image";
import { Badge } from "@/components/ui/badge";
import { getMerchantRules, getProductBySku, getProducts } from "@/lib/data/catalog";
import { formatPaise, formatPoints } from "@/lib/format";
import { pointsForSpend } from "@/lib/points";

export async function generateStaticParams() {
  const products = await getProducts();
  return products.map((p) => ({ sku: p.sku }));
}

export async function generateMetadata(props: PageProps<"/products/[sku]">): Promise<Metadata> {
  const { sku } = await props.params;
  const product = await getProductBySku(sku);
  return product ? { title: product.short_name ?? product.name } : { title: "Product not found" };
}

export default async function ProductPage(props: PageProps<"/products/[sku]">) {
  const { sku } = await props.params;
  const [product, rules] = await Promise.all([getProductBySku(sku), getMerchantRules()]);
  if (!product) notFound();

  const specs = Array.isArray(product.specs)
    ? product.specs.filter((s): s is string => typeof s === "string")
    : [];
  const earn = pointsForSpend(product.sale_price_paise, {
    earnRateBps: rules.earnRateBps,
    multiplierBps: 10_000,
  });
  const pointsValue = formatPaise(earn * rules.pointValuePaise);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" aria-hidden />
        All products
      </Link>
      <div className="grid gap-8 md:grid-cols-2">
        <ProductImage
          path={product.image_path}
          alt={product.name}
          sizes="(min-width: 768px) 50vw, 100vw"
          priority
          className="border"
        />
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Badge variant="outline" className="w-fit capitalize">
              {product.category}
            </Badge>
            <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
            <Price
              salePaise={product.sale_price_paise}
              listPaise={product.list_price_paise}
              className="text-lg"
            />
          </div>
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
            Earn <strong>{formatPoints(earn)}</strong> (worth {pointsValue}) when this order is
            completed. Gold and Platinum members earn more.
          </p>
          <AddToCartButton
            size="lg"
            product={{
              productId: product.id,
              sku: product.sku,
              name: product.name,
              imagePath: product.image_path,
              salePricePaise: product.sale_price_paise,
              listPricePaise: product.list_price_paise,
              active: true,
            }}
          />
          {product.description ? (
            <p className="text-muted-foreground">{product.description}</p>
          ) : null}
          {specs.length > 0 ? (
            <section aria-labelledby="specs-heading" className="flex flex-col gap-2">
              <h2 id="specs-heading" className="font-medium">
                Specifications
              </h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {specs.map((spec) => (
                  <li key={spec}>{spec}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
