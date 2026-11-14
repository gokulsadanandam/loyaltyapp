import { Badge } from "@/components/ui/badge";
import type { Enums } from "@/lib/database.types";

const LABELS: Record<
  Enums<"order_status">,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  pending: { label: "Awaiting pickup", variant: "secondary" },
  fulfilled: { label: "Completed", variant: "default" },
  cancelled: { label: "Cancelled", variant: "outline" },
  refunded: { label: "Refunded", variant: "outline" },
};

export function OrderStatusBadge({ status }: { status: Enums<"order_status"> }) {
  const { label, variant } = LABELS[status];
  return <Badge variant={variant}>{label}</Badge>;
}
