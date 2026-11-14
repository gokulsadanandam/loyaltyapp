import { GemIcon } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
        <GemIcon className="size-4" aria-hidden />
      </span>
      <span className={compact ? "hidden sm:inline" : undefined}>Loyalty Demo Store</span>
    </span>
  );
}
