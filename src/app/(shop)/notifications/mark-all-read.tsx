"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { markAllRead } from "./actions";

export function MarkAllRead() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await markAllRead();
          if (!result.ok) toast.error(result.error);
        });
      }}
    >
      {pending ? "Marking…" : "Mark all as read"}
    </Button>
  );
}
