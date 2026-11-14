"use client";

import { Button } from "@/components/ui/button";

export default function ShopError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-16" role="alert">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        Please try again. If it keeps happening, come back in a few minutes.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
