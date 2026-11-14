"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { saveReferralSettings } from "@/app/staff/catalog/actions";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ReferralSettings } from "@/lib/data/admin-catalog";

export function ReferralSettingsForm({
  settings,
  editable,
}: {
  settings: ReferralSettings;
  editable: boolean;
}) {
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
      const result = await saveReferralSettings({
        referrerPoints: get("referrerPoints"),
        refereePoints: get("refereePoints"),
        minOrder: get("minOrder"),
      });
      if (result.ok) toast.success("Referral programme updated.");
      else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  };

  const input = (name: string, label: string, value: string) => (
    <Field data-invalid={fieldErrors[name] ? true : undefined}>
      <FieldLabel htmlFor={`ref-${name}`}>{label}</FieldLabel>
      <Input
        id={`ref-${name}`}
        name={name}
        defaultValue={value}
        inputMode="decimal"
        disabled={!editable}
        className="tabular-nums"
      />
      <FieldError errors={fieldErrors[name]?.map((message) => ({ message })) ?? []} />
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {error ? <FormMessage status="error" message={error} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        {input("referrerPoints", "Referrer earns (pts)", String(settings.referrerPoints))}
        {input("refereePoints", "New member earns (pts)", String(settings.refereePoints))}
        {input("minOrder", "Minimum first order (₹)", String(settings.minOrderPaise / 100))}
      </div>
      {editable ? (
        <Button type="submit" className="w-fit" disabled={pending}>
          {pending ? "Saving…" : "Save programme"}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Only the owner can change these.</p>
      )}
    </form>
  );
}
