import { discountPercent, formatPaise } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Price({
  salePaise,
  listPaise,
  className,
}: {
  salePaise: number;
  listPaise: number;
  className?: string;
}) {
  const off = discountPercent(listPaise, salePaise);
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2", className)}>
      <span className="font-semibold tabular-nums">{formatPaise(salePaise)}</span>
      {off > 0 ? (
        <>
          <span className="text-sm text-muted-foreground tabular-nums line-through">
            <span className="sr-only">was </span>
            {formatPaise(listPaise)}
          </span>
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            {off}% off
          </span>
        </>
      ) : null}
    </div>
  );
}
