import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

/** App-wide 404, used outside the (shop) group (e.g. notFound() in /staff). */
export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-start gap-3 px-4 py-16"
    >
      <h1 className="text-xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="text-muted-foreground">It may have moved, or the link might be wrong.</p>
      <Link href="/" className={buttonVariants()}>
        Back to the store
      </Link>
    </main>
  );
}
