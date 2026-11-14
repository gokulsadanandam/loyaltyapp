import { BellIcon, CoinsIcon } from "lucide-react";
import Link from "next/link";

import { SessionSync } from "@/components/session-sync";
import { buttonVariants } from "@/components/ui/button";
import { displayName, getAccountSummary } from "@/lib/data/account";
import { getUnreadCount } from "@/lib/data/notifications";
import { getStaffContext } from "@/lib/data/staff";
import { formatPoints } from "@/lib/format";

import { AccountMenu } from "./account-menu";
import { CartButton } from "./cart-button";

/** Header controls that depend on the session. Rendered behind <Suspense>. */
export async function UserNav() {
  const [summary, staff, unread] = await Promise.all([
    getAccountSummary(),
    getStaffContext(),
    getUnreadCount(),
  ]);

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
        aria-label={`${formatPoints(summary.available)} available. View account`}
      >
        <CoinsIcon aria-hidden />
        <span data-testid="points-balance">{summary.available.toLocaleString("en-IN")}</span>
        <span className="hidden text-muted-foreground sm:inline">pts</span>
      </Link>
      <Link
        href="/notifications"
        className={buttonVariants({ variant: "ghost", size: "icon", className: "relative" })}
        aria-label={unread > 0 ? `Notifications, ${String(unread)} unread` : "Notifications"}
      >
        <BellIcon aria-hidden />
        {unread > 0 ? (
          <span
            data-testid="unread-count"
            className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground tabular-nums"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Link>
      <CartButton />
      <AccountMenu
        name={displayName(summary)}
        tier={summary.tier?.name ?? null}
        isStaff={staff !== null}
      />
    </>
  );
}
