import { env } from "@/lib/env";

/** Public URL for an object in the public `product-images` bucket. */
export function productImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${encoded}`;
}
