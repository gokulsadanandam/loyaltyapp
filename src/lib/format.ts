const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const count = new Intl.NumberFormat("en-IN");
const date = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

/** 119500 → "₹1,195". Money is stored as integer paise everywhere. */
export function formatPaise(paise: number): string {
  return inr.format(paise / 100);
}

export function formatPoints(points: number): string {
  return `${count.format(points)} ${Math.abs(points) === 1 ? "pt" : "pts"}`;
}

export function formatDateTime(iso: string): string {
  return date.format(new Date(iso));
}

/** Whole-percent discount between list and sale price, or 0. */
export function discountPercent(listPaise: number, salePaise: number): number {
  if (listPaise <= 0 || salePaise >= listPaise) return 0;
  return Math.round(((listPaise - salePaise) / listPaise) * 100);
}

export function shortOrderId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
