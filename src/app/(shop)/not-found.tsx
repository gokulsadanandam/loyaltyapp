import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3 py-16">
      <h1 className="text-xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="text-muted-foreground">It may have moved, or the link might be wrong.</p>
      <Link href="/" className={buttonVariants()}>
        Back to the store
      </Link>
    </div>
  );
}
