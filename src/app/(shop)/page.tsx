import { CoinsIcon, GiftIcon, StoreIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { Price } from "@/components/price";
import { ProductImage } from "@/components/product-image";
import { Badge } from "@/components/ui/badge";
import { getMerchantRules, getProducts } from "@/lib/data/catalog";
import { formatPoints } from "@/lib/format";
import { pointsForSpend } from "@/lib/points";

import { WelcomeToast } from "./welcome-toast";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-10">
      <Suspense>
        <WelcomeToast />
      </Suspense>
      <Hero />
      <section aria-labelledby="catalog-heading" className="flex flex-col gap-4">
        <h2 id="catalog-heading" className="text-xl font-semibold tracking-tight">
          Shop the collection
        </h2>
        <ProductGrid />
      </section>
    </div>
  );
}

async function Hero() {
  "use cache";
  const rules = await getMerchantRules();
  const earnPercent = rules.earnRateBps / 100;
  return (
    <section className="grid gap-6 rounded-2xl bg-muted/50 p-6 sm:grid-cols-3 sm:p-8">
      <div className="flex flex-col gap-2 sm:col-span-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Every order earns you points.
        </h1>
        <p className="max-w-prose text-muted-foreground">
          Join free and get {rules.signupBonusPoints} points. Earn {earnPercent}% back on every
          order and spend points at checkout or on rewards.
        </p>
      </div>
      <Perk icon={<CoinsIcon aria-hidden />} title={`${String(earnPercent)}% back`}>
        Points land when your order is completed.
      </Perk>
      <Perk icon={<GiftIcon aria-hidden />} title="Redeem anytime">
        Pay up to half of any order with points.
      </Perk>
      <Perk icon={<StoreIcon aria-hidden />} title="Pick up in store">
        Three stores across Bengaluru.
      </Perk>
    </section>
  );
}

function Perk({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background">
        {icon}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

async function ProductGrid() {
  "use cache";
  const [products, rules] = await Promise.all([getProducts(), getMerchantRules()]);
  const baseEarn = { earnRateBps: rules.earnRateBps, multiplierBps: 10_000 };

  if (products.length === 0) {
    return <p className="text-muted-foreground">No products yet. Check back soon.</p>;
  }

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product, index) => (
        <li key={product.id}>
          <Link
            href={`/products/${product.sku}`}
            className="group flex h-full flex-col gap-3 rounded-xl border p-3 transition-shadow outline-none hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ProductImage
              path={product.image_path}
              alt=""
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              priority={index < 4}
            />
            <div className="flex flex-1 flex-col gap-1">
              <h3 className="line-clamp-2 text-sm font-medium group-hover:underline">
                {product.name}
              </h3>
              <Price
                salePaise={product.sale_price_paise}
                listPaise={product.list_price_paise}
                className="mt-auto"
              />
              <Badge variant="secondary" className="w-fit">
                Earn {formatPoints(pointsForSpend(product.sale_price_paise, baseEarn))}
              </Badge>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
