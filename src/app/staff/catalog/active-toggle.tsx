"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/errors";

/** Show/hide a catalog row. Hiding keeps order history intact (no deletes). */
export function ActiveToggle({
  id,
  active,
  name,
  action,
}: {
  id: string;
  active: boolean;
  name: string;
  action: (input: { id: string; active: boolean }) => Promise<ActionResult>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={active ? "outline" : "secondary"}
      size="sm"
      disabled={pending}
      aria-label={`${active ? "Hide" : "Show"} ${name}`}
      onClick={() => {
        startTransition(async () => {
          const result = await action({ id, active: !active });
          if (result.ok) toast.success(`${name} is now ${active ? "hidden" : "live"}.`);
          else toast.error(result.error);
        });
      }}
    >
      {active ? "Hide" : "Show"}
    </Button>
  );
}
