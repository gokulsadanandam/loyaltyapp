import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/logo";
import { Skeleton } from "@/components/ui/skeleton";

import { UserNav } from "./user-nav";

export default function ShopLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/" aria-label="Loyalty Demo Store home">
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-4 text-sm sm:flex">
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              Shop
            </Link>
            <Link href="/rewards" className="text-muted-foreground hover:text-foreground">
              Rewards
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {/* Session-dependent: streams in after the static shell. */}
            <Suspense fallback={<Skeleton className="h-8 w-40" />}>
              <UserNav />
            </Suspense>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Earn 10% back in points on every order. Points are worth ₹0.25 each.
      </footer>
    </>
  );
}
