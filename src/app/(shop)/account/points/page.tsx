import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import { getAccountSummary } from "@/lib/data/account";
import { entryLabel, getPointsHistory } from "@/lib/data/points";
import { formatDateTime, formatPoints, shortOrderId } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Points history" };

export default function PointsHistoryPage(props: PageProps<"/account/points">) {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/account"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" aria-hidden />
        Account
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Points history</h1>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <History searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function History({ searchParams }: Pick<PageProps<"/account/points">, "searchParams">) {
  await requireUser("/account/points");
  const { before } = await searchParams;
  const [summary, { entries, nextCursor }] = await Promise.all([
    getAccountSummary(),
    getPointsHistory(typeof before === "string" ? before : undefined),
  ]);

  return (
    <div className="flex flex-col gap-4">
      {summary ? (
        <p className="text-sm text-muted-foreground">
          {formatPoints(summary.available)} available
          {summary.balance > summary.available
            ? ` · ${formatPoints(summary.balance - summary.available)} expired, clearing tonight`
            : ""}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <p className="text-muted-foreground">No points activity yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border" aria-label="Points activity">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">{entryLabel(entry)}</span>
                <span className="text-sm text-muted-foreground">
                  {formatDateTime(entry.createdAt)}
                  {entry.refType === "order" && entry.refId ? (
                    <>
                      {" · "}
                      <Link
                        href={`/orders/${entry.refId}`}
                        className="underline underline-offset-4"
                      >
                        Order #{shortOrderId(entry.refId)}
                      </Link>
                    </>
                  ) : null}
                </span>
              </div>
              <span
                className={cn(
                  "font-semibold whitespace-nowrap tabular-nums",
                  entry.points > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-foreground",
                )}
              >
                {entry.points > 0 ? "+" : "−"}
                {formatPoints(Math.abs(entry.points))}
              </span>
            </li>
          ))}
        </ul>
      )}

      {nextCursor ? (
        <Link
          href={`/account/points?before=${encodeURIComponent(nextCursor)}`}
          className={buttonVariants({ variant: "outline", className: "w-fit" })}
        >
          Older activity
        </Link>
      ) : null}
    </div>
  );
}
