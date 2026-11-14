import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

/** Form-level status. role=alert/status so screen readers announce it after submit. */
export function FormMessage({
  status,
  message,
}: {
  status: "idle" | "error" | "success";
  message?: string | undefined;
}) {
  if (status === "idle" || !message) return null;
  const isError = status === "error";
  return (
    <Alert variant={isError ? "destructive" : "default"} role={isError ? "alert" : "status"}>
      {isError ? <CircleAlertIcon aria-hidden /> : <CircleCheckIcon aria-hidden />}
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
