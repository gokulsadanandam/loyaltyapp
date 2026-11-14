"use client";

import { useActionState } from "react";

import { updatePassword, type FormState } from "@/app/(auth)/actions";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";

/** Reached from the recovery email via /auth/callback, which signs the user in first. */
export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(updatePassword, {
    status: "idle",
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Choose a new password</CardTitle>
        <CardDescription>At least 8 characters, with a letter and a number.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} noValidate>
          <FieldGroup>
            <FormMessage status={state.status} message={state.message} />
            <FormField
              name="password"
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              errors={state.fieldErrors?.password}
            />
            <FormField
              name="confirm"
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              required
              errors={state.fieldErrors?.confirm}
            />
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Saving…" : "Update password"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
