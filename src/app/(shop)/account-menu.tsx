"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CircleUserIcon } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";

import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AccountMenu({ name, tier }: { name: string; tier: string | null }) {
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Account menu" />}
      >
        <CircleUserIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block truncate">{name}</span>
            {tier ? (
              <span className="text-xs font-normal text-muted-foreground">{tier} member</span>
            ) : null}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/account" />}>Account &amp; orders</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/rewards" />}>Rewards</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              await signOut();
              // Full page load, not a client navigation: discards the query cache,
              // the router cache and any prefetched per-session shells, so nothing
              // from this user survives on a shared device.
              queryClient.clear();
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional hard reload on sign-out
              window.location.assign("/");
            });
          }}
        >
          {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
