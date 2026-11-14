"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { fulfillOrder, refundOrder } from "@/app/staff/actions";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Enums } from "@/lib/database.types";
import { formatPoints } from "@/lib/format";

export function OrderActions({
  orderId,
  status,
  refundAllowed,
  label,
}: {
  orderId: string;
  status: Enums<"order_status">;
  refundAllowed: boolean;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [refundOpen, setRefundOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [refundError, setRefundError] = useState<string | null>(null);

  const fulfil = () => {
    startTransition(async () => {
      const result = await fulfillOrder(orderId);
      if (result.ok) {
        toast.success(`${label} completed. Customer earned ${formatPoints(result.data.earned)}.`);
      } else {
        toast.error(result.error);
      }
    });
  };

  const refund = () => {
    setRefundError(null);
    startTransition(async () => {
      const result = await refundOrder({ orderId, reason });
      if (result.ok) {
        setRefundOpen(false);
        toast.success(`${label} ${result.data.status === "cancelled" ? "cancelled" : "refunded"}.`);
      } else {
        setRefundError(result.error);
      }
    });
  };

  const canRefundNow = refundAllowed && (status === "pending" || status === "fulfilled");

  return (
    <div className="flex gap-2">
      {status === "pending" ? (
        <Button onClick={fulfil} disabled={pending} aria-label={`Mark ${label} collected and paid`}>
          {pending ? "Saving…" : "Collected & paid"}
        </Button>
      ) : null}
      {canRefundNow ? (
        <Button
          variant="outline"
          onClick={() => {
            setReason("");
            setRefundError(null);
            setRefundOpen(true);
          }}
          disabled={pending}
        >
          {status === "pending" ? "Cancel" : "Refund"}
        </Button>
      ) : null}

      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {status === "pending" ? "Cancel" : "Refund"} {label}?
            </DialogTitle>
            <DialogDescription>
              Points used on this order go back to the customer. Points earned on it are taken back,
              as far as their balance allows.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={`reason-${orderId}`}>Reason</FieldLabel>
            <Input
              id={`reason-${orderId}`}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
              placeholder="e.g. Item returned unopened"
              maxLength={500}
            />
          </Field>
          {refundError ? <FormMessage status="error" message={refundError} /> : null}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Keep order</DialogClose>
            <Button variant="destructive" onClick={refund} disabled={pending}>
              {pending ? "Working…" : status === "pending" ? "Cancel order" : "Refund order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
