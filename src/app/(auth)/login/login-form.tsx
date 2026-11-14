"use client";

import Link from "next/link";
import { useActionState } from "react";

import { login, type FormState } from "@/app/(auth)/actions";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";

export function LoginForm({ next, notice }: { next: string; notice: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {
    status: notice ? "success" : "idle",
    ...(notice ? { message: notice } : {}),
  });

  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={next} />
      <FieldGroup>
        <FormMessage status={state.status} message={state.message} />
        <FormField
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          errors={state.fieldErrors?.email}
        />
        <FormField
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          errors={state.fieldErrors?.password}
        />
        <div className="-mt-3 text-right text-sm">
          <Link
            href="/forgot-password"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </FieldGroup>
    </form>
  );
}
