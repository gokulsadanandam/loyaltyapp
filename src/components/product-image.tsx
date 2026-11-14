import { ImageOffIcon } from "lucide-react";
import Image from "next/image";

import { productImageUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

export function ProductImage({
  path,
  alt,
  sizes,
  priority = false,
  className,
}: {
  path: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const src = productImageUrl(path);
  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-lg bg-muted", className)}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-contain p-4 mix-blend-multiply dark:mix-blend-normal"
        />
      ) : (
        <div className="grid h-full place-items-center text-muted-foreground">
          <ImageOffIcon aria-hidden />
          <span className="sr-only">No image</span>
        </div>
      )}
    </div>
  );
}
