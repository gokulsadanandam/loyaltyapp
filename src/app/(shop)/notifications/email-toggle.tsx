"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setEmailNotifications } from "./actions";

export function EmailToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={enabled}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setEnabled(next);
          startTransition(async () => {
            const result = await setEmailNotifications(next);
            if (result.ok)
              toast.success(next ? "Email notifications on." : "Email notifications off.");
            else {
              setEnabled(!next);
              toast.error(result.error);
            }
          });
        }}
      />
      Also send these by email
    </label>
  );
}
