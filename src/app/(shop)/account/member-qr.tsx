"use client";

import { RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { getMemberQr } from "./actions";

const REFRESH_MS = 50_000; // tokens rotate every minute and verify for ~2

/** Rotating member QR for in-store earning. Refreshes while the page is visible. */
export function MemberQr() {
  const [qr, setQr] = useState<{ token: string; image: string } | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await getMemberQr();
      if (result.ok) {
        setQr(result.data);
        setError(false);
      } else {
        setError(true);
      }
    });
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="grid size-40 place-items-center rounded-lg border bg-white p-1">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element -- data: URL generated on our server
          <img
            src={qr.image}
            alt="Your member QR code. Show it at the counter to earn points."
            width={152}
            height={152}
            data-testid="member-qr"
            data-token={qr.token}
          />
        ) : (
          <span className="text-xs text-neutral-500">{error ? "Couldn't load" : "Loading…"}</span>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={refresh} disabled={pending}>
        <RefreshCwIcon className={pending ? "animate-spin" : undefined} aria-hidden />
        Refresh code
      </Button>
    </div>
  );
}
