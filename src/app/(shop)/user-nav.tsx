import { CoinsIcon } from "lucide-react";
import Link from "next/link";

import { SessionSync } from "@/components/session-sync";
import { buttonVariants } from "@/components/ui/button";
import { displayName, getAccountSummary } from "@/lib/data/account";
import { formatPoints } from "@/lib/format";

import { AccountMenu } from "./account-menu";
import { CartButton } from "./cart-button";

/** Header controls that depend on the session. Rendered behind <Suspense>. */
export async function UserNav() {
  const summary = await getAccountSummary();

  if (!summary) {
    return (
      <>
        <SessionSync userId={null} />
        <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
          Sign in
        </Link>
        <Link href="/signup" className={buttonVariants()}>
          Join
        </Link>
      </>
    );
  }

  return (
    <>
      <SessionSync userId={summary.userId} />
      <Link
        href="/account"
        className={buttonVariants({ variant: "secondary", className: "tabular-nums" })}
        aria-label={`${formatPoints(summary.balance)} available. View account`}
      >
        <CoinsIcon aria-hidden />
        <span data-testid="points-balance">{summary.balance.toLocaleString("en-IN")}</span>
        <span className="hidden text-muted-foreground sm:inline">pts</span>
      </Link>
      <CartButton />
      <AccountMenu name={displayName(summary)} tier={summary.tier?.name ?? null} />
    </>
  );
}
