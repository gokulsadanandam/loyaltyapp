"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

/** After email confirmation the callback lands on `/?welcome=1`. Greet once, then clean the URL. */
export function WelcomeToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const welcome = params.get("welcome") === "1";

  useEffect(() => {
    if (!welcome) return;
    toast.success("Welcome! Your account is active and your bonus points are in.", {
      duration: 10_000,
    });
    router.replace(pathname, { scroll: false });
  }, [welcome, router, pathname]);

  return null;
}
