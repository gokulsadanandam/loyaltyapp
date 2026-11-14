"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { saveReward } from "@/app/staff/catalog/actions";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AdminReward } from "@/lib/data/admin-catalog";

/** ISO instant -> value for <input type="datetime-local"> in the browser's zone. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local (browser zone) -> ISO instant, so the server never guesses a zone. */
function toIso(local: string): string {
  return local ? new Date(local).toISOString() : "";
}

export function RewardForm({
  reward,
  products,
}: {
  reward?: AdminReward;
  products: { id: string; name: string; sku: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();

  const submit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => {
      const v = fd.get(k);
      return typeof v === "string" ? v : "";
    };
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await saveReward({
        ...(reward ? { id: reward.id } : {}),
        name: get("name"),
        description: get("description"),
        pointsCost: get("pointsCost"),
        stock: get("stock"),
        productId: get("productId"),
        startsAt: toIso(get("startsAt")),
        endsAt: toIso(get("endsAt")),
        active: fd.get("active") === "on",
      });
      if (result.ok) {
        toast.success(reward ? "Reward saved." : "Reward created.");
        router.push("/staff/rewards");
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  };

  const err = (k: string) => fieldErrors[k]?.map((message) => ({ message })) ?? [];
  const invalid = (k: string) => (fieldErrors[k] ? true : undefined);

  return (
    <form onSubmit={submit} noValidate className="max-w-2xl">
      <Card>
        <CardContent className="pt-6">
          <FieldGroup>
            {error ? <FormMessage status="error" message={error} /> : null}
            <Field data-invalid={invalid("name")}>
              <FieldLabel htmlFor="r-name">Name</FieldLabel>
              <Input id="r-name" name="name" defaultValue={reward?.name ?? ""} maxLength={120} />
              <FieldError errors={err("name")} />
            </Field>
            <Field data-invalid={invalid("description")}>
              <FieldLabel htmlFor="r-description">Description (optional)</FieldLabel>
              <Input
                id="r-description"
                name="description"
                defaultValue={reward?.description ?? ""}
              />
              <FieldError errors={err("description")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={invalid("pointsCost")}>
                <FieldLabel htmlFor="r-points">Points cost</FieldLabel>
                <Input
                  id="r-points"
                  name="pointsCost"
                  inputMode="numeric"
                  defaultValue={reward ? String(reward.points_cost) : ""}
                  className="tabular-nums"
                />
                <FieldError errors={err("pointsCost")} />
              </Field>
              <Field data-invalid={invalid("stock")}>
                <FieldLabel htmlFor="r-stock">Stock</FieldLabel>
                <Input
                  id="r-stock"
                  name="stock"
                  inputMode="numeric"
                  defaultValue={reward?.stock != null ? String(reward.stock) : ""}
                  className="tabular-nums"
                />
                <FieldDescription>Leave blank for unlimited.</FieldDescription>
                <FieldError errors={err("stock")} />
              </Field>
            </div>
            <Field data-invalid={invalid("productId")}>
              <FieldLabel htmlFor="r-product">Linked product (optional)</FieldLabel>
              <select
                id="r-product"
                name="productId"
                defaultValue={reward?.product_id ?? ""}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
              >
                <option value="">None (a perk or voucher)</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {p.name}
                  </option>
                ))}
              </select>
              <FieldError errors={err("productId")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={invalid("startsAt")}>
                <FieldLabel htmlFor="r-starts">Starts (optional)</FieldLabel>
                <Input
                  id="r-starts"
                  name="startsAt"
                  type="datetime-local"
                  defaultValue={toLocalInput(reward?.starts_at)}
                />
                <FieldError errors={err("startsAt")} />
              </Field>
              <Field data-invalid={invalid("endsAt")}>
                <FieldLabel htmlFor="r-ends">Ends (optional)</FieldLabel>
                <Input
                  id="r-ends"
                  name="endsAt"
                  type="datetime-local"
                  defaultValue={toLocalInput(reward?.ends_at)}
                />
                <FieldError errors={err("endsAt")} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={reward?.active ?? true} />
              Live on the rewards page
            </label>
            <Button type="submit" size="lg" className="w-fit" disabled={pending}>
              {pending ? "Saving…" : reward ? "Save changes" : "Create reward"}
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>
    </form>
  );
}
