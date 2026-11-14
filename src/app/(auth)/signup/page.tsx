import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getMerchantRules } from "@/lib/data/catalog";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage(props: PageProps<"/signup">) {
  const { signupBonusPoints } = await getMerchantRules();
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
          <SignupFormWithParams searchParams={props.searchParams} bonus={signupBonusPoints} />
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
}: {
  searchParams: PageProps<"/signup">["searchParams"];
  bonus: number;
}) {
  const { ref } = await searchParams;
  const referralCode = typeof ref === "string" ? ref.replace(/[^A-Za-z0-9]/g, "").slice(0, 16) : "";
  return <SignupForm referralCode={referralCode} bonus={bonus} />;
}
