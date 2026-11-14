import Link from "next/link";

import { canRefund, getStaffContext } from "@/lib/data/staff";

const LINK = "text-muted-foreground hover:text-foreground";

/** Cashiers see the counter tools only; owners/admins also manage the catalog. */
export async function StaffNav() {
  const ctx = await getStaffContext();
  if (!ctx) return null;
  const isAdmin = canRefund(ctx.role);
  return (
    <nav aria-label="Staff" className="flex items-center gap-3 text-sm sm:gap-4">
      <Link href="/staff/orders" className={LINK}>
        Orders
      </Link>
      <Link href="/staff/award" className={LINK}>
        Award
      </Link>
      {isAdmin ? (
        <>
          <Link href="/staff/catalog" className={LINK}>
            Catalog
          </Link>
          <Link href="/staff/rewards" className={LINK}>
            Rewards
          </Link>
          <Link href="/staff/analytics" className={LINK}>
            Analytics
          </Link>
        </>
      ) : null}
    </nav>
  );
}
