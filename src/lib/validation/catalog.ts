import { z } from "zod";

/** "1499.5" -> 149950. Exact: money never goes through floating point. */
export function rupeesToPaise(value: string): number {
  const [rupees = "0", paise = ""] = value.split(".");
  return Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
}

export const rupees = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,7}(\.\d{1,2})?$/, `Enter ${label} in rupees, e.g. 1499 or 1499.50.`)
    .transform(rupeesToPaise);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

/** Image paths must live in the merchant's own folder (also enforced by storage RLS). */
export const imagePathFor = (merchantId: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine(
      (v) =>
        v === null ||
        new RegExp(`^${merchantId}/products/[A-Za-z0-9._-]{1,120}\\.(png|jpe?g|webp)$`).test(v),
      "Invalid image.",
    );

export const productSchema = (merchantId: string) =>
  z
    .object({
      id: z.uuid().optional(),
      sku: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9-]{3,40}$/, "3–40 characters: letters, numbers and dashes."),
      name: z.string().trim().min(1, "Enter a name.").max(200),
      shortName: optionalText(60),
      category: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9 -]{1,40}$/, "Use letters, numbers, spaces or dashes."),
      description: optionalText(2000),
      // One spec per line; blank lines dropped.
      specs: z
        .string()
        .transform((v) =>
          v
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean),
        )
        .pipe(z.array(z.string().max(300, "Each spec line must be under 300 characters.")).max(20)),
      listPrice: rupees("the list price"),
      salePrice: rupees("the sale price"),
      imagePath: imagePathFor(merchantId),
      active: z.boolean(),
    })
    .refine((v) => v.salePrice <= v.listPrice, {
      message: "Sale price can't be above the list price.",
      path: ["salePrice"],
    })
    .refine((v) => v.salePrice > 0, { message: "Enter a sale price.", path: ["salePrice"] });

const optionalInt = (label: string, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^\d{1,7}$/.test(v), `Enter ${label} as a whole number.`)
    .transform((v) => (v === null ? null : Number(v)))
    .refine((v) => v === null || v <= max, `${label} is too large.`);

/** datetime-local value converted to ISO by the client; empty = no limit. */
const optionalInstant = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Enter a valid date and time.");

export const rewardSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, "Enter a name.").max(120), // rewards.name CHECK
    description: optionalText(1000),
    pointsCost: z
      .string()
      .trim()
      .regex(/^\d{1,7}$/, "Enter the points cost as a whole number.")
      .transform(Number)
      .refine((v) => v > 0 && v <= 1_000_000, "Between 1 and 10,00,000 points."),
    stock: optionalInt("stock", 1_000_000),
    productId: z
      .string()
      .transform((v) => (v === "" ? null : v))
      .pipe(z.uuid().nullable()),
    startsAt: optionalInstant,
    endsAt: optionalInstant,
    active: z.boolean(),
  })
  .refine((v) => !v.startsAt || !v.endsAt || Date.parse(v.endsAt) > Date.parse(v.startsAt), {
    message: "The end must be after the start.",
    path: ["endsAt"],
  });

export const referralSettingsSchema = z.object({
  referrerPoints: z
    .string()
    .trim()
    .regex(/^\d{1,6}$/, "Whole number of points.")
    .transform(Number),
  refereePoints: z
    .string()
    .trim()
    .regex(/^\d{1,6}$/, "Whole number of points.")
    .transform(Number),
  minOrder: rupees("the minimum order"),
});
