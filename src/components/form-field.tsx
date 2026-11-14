import type { ComponentProps } from "react";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface FormFieldProps extends Omit<ComponentProps<typeof Input>, "id" | "name"> {
  name: string;
  label: string;
  description?: string;
  errors?: string[] | undefined;
}

/** Label + input + description + errors, wired together for screen readers. */
export function FormField({ name, label, description, errors, ...inputProps }: FormFieldProps) {
  const id = `field-${name}`;
  const invalid = Boolean(errors?.length);
  const describedBy =
    [description ? `${id}-description` : null, invalid ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {description ? (
        <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
      ) : null}
      {invalid ? (
        <FieldError id={`${id}-error`} errors={(errors ?? []).map((message) => ({ message }))} />
      ) : null}
    </Field>
  );
}
