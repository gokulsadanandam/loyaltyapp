"use client";

import { MailCheckIcon } from "lucide-react";
import { useActionState } from "react";

import { signup, type FormState } from "@/app/(auth)/actions";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";

export function SignupForm({ referralCode, bonus }: { referralCode: string; bonus: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signup, { status: "idle" });

  if (state.status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
        <MailCheckIcon className="size-10 text-primary" aria-hidden />
        <h2 className="text-lg font-semibold">Check your inbox</h2>
        <p className="text-sm text-muted-foreground">{state.message}</p>
      </div>
    );
  }

  const v = state.values ?? {};
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate>
      <FieldGroup>
        <FormMessage status={state.status} message={state.message} />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            name="firstName"
            label="First name"
            autoComplete="given-name"
            required
            defaultValue={v.firstName}
            errors={err.firstName}
          />
          <FormField
            name="lastName"
            label="Last name"
            autoComplete="family-name"
            defaultValue={v.lastName}
            errors={err.lastName}
          />
        </div>
        <FormField
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          defaultValue={v.email}
          errors={err.email}
        />
        <FormField
          name="phone"
          label="Phone (optional)"
          type="tel"
          autoComplete="tel"
          defaultValue={v.phone}
          errors={err.phone}
        />
        <FormField
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          description="At least 8 characters, with a letter and a number."
          errors={err.password}
        />
        <FormField
          name="referralCode"
          label="Referral code (optional)"
          autoCapitalize="characters"
          defaultValue={v.referralCode ?? referralCode}
          errors={err.referralCode}
        />
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Creating account…" : `Create account & get ${String(bonus)} points`}
        </Button>
      </FieldGroup>
    </form>
  );
}
