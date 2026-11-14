import type { Metadata } from "next";
import Link from "next/link";
import { GiftIcon } from "lucide-react";
import { Suspense } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getMerchantRules } from "@/lib/data/catalog";
import { formatPaise, formatPoints } from "@/lib/format";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage(props: PageProps<"/signup">) {
  const { signupBonusPoints, referral } = await getMerchantRules();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Join and earn</CardTitle>
        <CardDescription>
          Get {signupBonusPoints} points when you confirm your email, then earn on every order.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Suspense fallback={<Skeleton className="h-[30rem]" />}>
          <SignupFormWithParams
            searchParams={props.searchParams}
            bonus={signupBonusPoints}
            referral={referral}
          />
        </Suspense>
        <p className="text-center text-sm text-muted-foreground">
          Already a member?{" "}
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

async function SignupFormWithParams({
  searchParams,
  bonus,
  referral,
}: {
  searchParams: PageProps<"/signup">["searchParams"];
  bonus: number;
  referral: { refereePoints: number; minOrderPaise: number };
}) {
  const { ref } = await searchParams;
  const referralCode = typeof ref === "string" ? ref.replace(/[^A-Za-z0-9]/g, "").slice(0, 16) : "";
  return (
    <div className="flex flex-col gap-4">
      {referralCode && referral.refereePoints > 0 ? (
        <Alert data-testid="referral-offer">
          <GiftIcon aria-hidden />
          <AlertDescription>
            A friend invited you. You&apos;ll get an extra {formatPoints(referral.refereePoints)}{" "}
            when your first order of {formatPaise(referral.minOrderPaise)} or more is completed.
          </AlertDescription>
        </Alert>
      ) : null}
      <SignupForm referralCode={referralCode} bonus={bonus} />
    </div>
  );
}
