import { AwardIcon, BellIcon, HourglassIcon, TimerOffIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import type { Enums } from "@/lib/database.types";
import { getEmailPreference, getNotifications } from "@/lib/data/notifications";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { EmailToggle } from "./email-toggle";
import { MarkAllRead } from "./mark-all-read";

export const metadata: Metadata = { title: "Notifications" };

const ICONS: Record<Enums<"notification_kind">, typeof BellIcon> = {
  tier_up: AwardIcon,
  points_expiring: HourglassIcon,
  points_expired: TimerOffIcon,
};

export default function NotificationsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      <Suspense fallback={<Skeleton className="h-80" />}>
        <Feed />
      </Suspense>
    </div>
  );
}

async function Feed() {
  await requireUser("/notifications");
  const [items, emailOn] = await Promise.all([getNotifications(), getEmailPreference()]);
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <EmailToggle initial={emailOn} />
        {unread > 0 ? <MarkAllRead /> : null}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
          <BellIcon className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-muted-foreground">
            Nothing yet. We&apos;ll let you know about tier upgrades and points that are about to
            expire.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border" aria-label="Notifications">
          {items.map((n) => {
            const Icon = ICONS[n.kind];
            const content = (
              <>
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2 font-medium">
                    {n.title}
                    {!n.readAt ? (
                      <span className="size-2 rounded-full bg-primary" aria-label="Unread" />
                    ) : null}
                  </span>
                  <span className="text-sm text-muted-foreground">{n.body}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(n.createdAt)}
                  </span>
                </span>
              </>
            );
            return (
              <li key={n.id} className={cn(!n.readAt && "bg-muted/40")}>
                {n.link ? (
                  <Link href={n.link} className="flex gap-3 p-4 hover:bg-muted/60">
                    {content}
                  </Link>
                ) : (
                  <div className="flex gap-3 p-4">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
