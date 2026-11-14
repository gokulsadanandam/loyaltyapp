import { GemIcon } from "lucide-react";

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
        <GemIcon className="size-4" aria-hidden />
      </span>
      <span>Loyalty Demo Store</span>
    </span>
  );
}
