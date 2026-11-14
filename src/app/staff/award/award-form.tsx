"use client";

import { CircleCheckIcon, UserRoundSearchIcon } from "lucide-react";
import { useState, useTransition } from "react";

import { awardPoints, findMember } from "@/app/staff/actions";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Store } from "@/lib/data/catalog";
import type { MemberLookup } from "@/lib/data/staff";
import { formatPoints } from "@/lib/format";

import { QrScanner } from "./qr-scanner";

type Step =
  | { kind: "lookup" }
  | { kind: "amount"; member: MemberLookup }
  | { kind: "done"; memberName: string; points: number };

export function AwardForm({ stores }: { stores: Store[] }) {
  const [step, setStep] = useState<Step>({ kind: "lookup" });
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  // One key per award attempt: a double-tap or retry posts once.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setStep({ kind: "lookup" });
    setCode("");
    setAmount("");
    setError(null);
    setKey(crypto.randomUUID());
  };

  const lookupValue = (value: string) => {
    setError(null);
    startTransition(async () => {
      const result = await findMember(value);
      if (result.ok) setStep({ kind: "amount", member: result.data });
      else setError(result.error);
    });
  };

  const lookup = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    lookupValue(code);
  };

  const award = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (step.kind !== "amount") return;
    setError(null);
    startTransition(async () => {
      const result = await awardPoints({
        memberCode: step.member.memberCode,
        amount,
        idempotencyKey: key,
        ...(storeId ? { storeId } : {}),
      });
      if (result.ok) setStep({ kind: "done", ...result.data });
      else setError(result.error);
    });
  };

  if (step.kind === "done") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-6 text-center" role="status">
          <CircleCheckIcon className="size-10 text-emerald-600" aria-hidden />
          <p className="text-lg font-semibold">
            {formatPoints(step.points)} awarded to {step.memberName}
          </p>
          <Button onClick={reset}>Next customer</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        {step.kind === "lookup" ? (
          <form onSubmit={lookup} noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="member-code">Member code</FieldLabel>
                <Input
                  id="member-code"
                  value={code}
                  onChange={(e) => {
                    // QR tokens (LQ1.…) are case-sensitive; plain member codes are not.
                    const v = e.target.value.trim();
                    setCode(v.startsWith("LQ1.") ? v : v.toUpperCase());
                  }}
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="font-mono tracking-wider"
                  placeholder="LY…"
                />
                <FieldDescription>
                  Scan the QR on the customer&apos;s account page, or type their member code.
                </FieldDescription>
              </Field>
              {error ? <FormMessage status="error" message={error} /> : null}
              <div className="flex gap-2">
                <QrScanner
                  onScan={(value) => {
                    setCode(value);
                    lookupValue(value);
                  }}
                />
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={pending || code.trim().length < 4}
                >
                  <UserRoundSearchIcon aria-hidden />
                  {pending ? "Looking up…" : "Find member"}
                </Button>
              </div>
            </FieldGroup>
          </form>
        ) : (
          <form onSubmit={award} noValidate>
            <FieldGroup>
              <div className="rounded-lg bg-muted p-3 text-sm" data-testid="member-found">
                <p className="font-medium">{step.member.name}</p>
                <p className="text-muted-foreground">
                  <span className="font-mono">{step.member.memberCode}</span>
                  {step.member.tierName ? ` · ${step.member.tierName}` : ""}
                </p>
              </div>
              <Field>
                <FieldLabel htmlFor="amount">Bill amount (₹)</FieldLabel>
                <Input
                  id="amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value.replace(/[^0-9.]/g, ""));
                  }}
                  className="tabular-nums"
                  placeholder="1499"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="store">Store</FieldLabel>
                <select
                  id="store"
                  value={storeId}
                  onChange={(e) => {
                    setStoreId(e.target.value);
                  }}
                  className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              {error ? <FormMessage status="error" message={error} /> : null}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={reset} disabled={pending}>
                  Back
                </Button>
                <Button type="submit" className="flex-1" disabled={pending || amount === ""}>
                  {pending ? "Awarding…" : "Award points"}
                </Button>
              </div>
            </FieldGroup>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
