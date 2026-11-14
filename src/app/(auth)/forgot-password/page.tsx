"use client";

import Link from "next/link";
import { useActionState } from "react";

import { requestPasswordReset, type FormState } from "@/app/(auth)/actions";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordReset, {
    status: "idle",
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Reset your password</CardTitle>
        <CardDescription>We&apos;ll email you a link to choose a new one.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form action={action} noValidate>
          <FieldGroup>
            <FormMessage status={state.status} message={state.message} />
            {state.status !== "success" ? (
              <>
                <FormField
                  name="email"
                  label="Email"
                  type="email"
                  autoComplete="email"
                  required
                  defaultValue={state.values?.email}
                  errors={state.fieldErrors?.email}
                />
                <Button type="submit" size="lg" disabled={pending}>
                  {pending ? "Sending…" : "Send reset link"}
                </Button>
              </>
            ) : null}
          </FieldGroup>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
