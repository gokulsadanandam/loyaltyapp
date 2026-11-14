"use client";

import { GiftIcon, TicketCheckIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { redeemReward } from "@/app/(shop)/actions";
import { FormMessage } from "@/components/form-message";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { Reward } from "@/lib/data/catalog";
import { formatPoints } from "@/lib/format";

type Phase =
  { kind: "confirm" } | { kind: "done"; code: string } | { kind: "error"; message: string };

export function RewardCard({ reward, balance }: { reward: Reward; balance: number | null }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "confirm" });
  // A fresh key per dialog opening; retries inside one opening reuse it, so a
  // double-click or network retry redeems once.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();

  const outOfStock = reward.stock !== null && reward.stock <= 0;
  const signedIn = balance !== null;
  const affordable = signedIn && balance >= reward.points_cost;
  const shortBy = signedIn ? Math.max(0, reward.points_cost - balance) : 0;

  const openDialog = () => {
    setKey(crypto.randomUUID());
    setPhase({ kind: "confirm" });
    setOpen(true);
  };

  const confirm = () => {
    startTransition(async () => {
      const result = await redeemReward({ rewardId: reward.id, idempotencyKey: key });
      setPhase(
        result.ok
          ? { kind: "done", code: result.data.code }
          : { kind: "error", message: result.error },
      );
    });
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <span className="mb-2 grid size-10 place-items-center rounded-lg bg-muted">
          <GiftIcon aria-hidden />
        </span>
        <CardTitle>{reward.name}</CardTitle>
        {reward.description ? <CardDescription>{reward.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="mt-auto flex flex-col gap-2">
        <p className="text-lg font-semibold tabular-nums">{formatPoints(reward.points_cost)}</p>
        {reward.stock !== null && !outOfStock ? (
          <p className="text-xs text-muted-foreground">{reward.stock} left</p>
        ) : null}
        {signedIn && !affordable ? (
          <Progress
            value={Math.round((balance / reward.points_cost) * 100)}
            aria-label={`${String(balance)} of ${String(reward.points_cost)} points`}
          />
        ) : null}
      </CardContent>
      <CardFooter>
        {!signedIn ? (
          <Link
            href="/login?next=/rewards"
            className={buttonVariants({ variant: "outline", className: "w-full" })}
          >
            Sign in to redeem
          </Link>
        ) : outOfStock ? (
          <Button className="w-full" disabled>
            Out of stock
          </Button>
        ) : affordable ? (
          <Button className="w-full" onClick={openDialog}>
            Redeem
          </Button>
        ) : (
          <Button className="w-full" variant="secondary" disabled>
            {formatPoints(shortBy)} to go
          </Button>
        )}
      </CardFooter>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
        }}
      >
        <DialogContent>
          {phase.kind === "done" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <TicketCheckIcon className="size-5 text-emerald-600" aria-hidden />
                  Reward redeemed
                </DialogTitle>
                <DialogDescription>Show this code at the counter to claim it.</DialogDescription>
              </DialogHeader>
              <p
                className="rounded-lg bg-muted py-4 text-center font-mono text-2xl font-semibold tracking-widest"
                data-testid="redemption-code"
              >
                {phase.code}
              </p>
              <DialogFooter>
                <DialogClose render={<Button />}>Done</DialogClose>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Redeem {reward.name}?</DialogTitle>
                <DialogDescription>
                  {formatPoints(reward.points_cost)} will be deducted from your balance of{" "}
                  {formatPoints(balance ?? 0)}.
                </DialogDescription>
              </DialogHeader>
              {phase.kind === "error" ? (
                <FormMessage status="error" message={phase.message} />
              ) : null}
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                <Button onClick={confirm} disabled={pending}>
                  {pending ? "Redeeming…" : `Redeem for ${formatPoints(reward.points_cost)}`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
