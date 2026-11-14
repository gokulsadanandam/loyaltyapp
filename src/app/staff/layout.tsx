import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: { default: "Staff", template: "%s · Staff" } };

export default function StaffLayout({ children }: LayoutProps<"/staff">) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/staff/orders" aria-label="Staff console home">
            <Logo compact />
          </Link>
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Staff</span>
          <nav aria-label="Staff" className="flex items-center gap-3 text-sm sm:gap-4">
            <Link href="/staff/orders" className="text-muted-foreground hover:text-foreground">
              Orders
            </Link>
            <Link href="/staff/award" className="text-muted-foreground hover:text-foreground">
              Award points
            </Link>
          </nav>
          <Link
            href="/"
            className="ml-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" aria-hidden />
            <span className="hidden sm:inline">Store</span>
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
    </>
  );
}
