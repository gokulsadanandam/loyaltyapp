"use client";

import { ImageUpIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormMessage } from "@/components/form-message";
import { ProductImage } from "@/components/product-image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AdminProduct } from "@/lib/data/admin-catalog";
import { createClient } from "@/lib/supabase/client";

import { saveProduct } from "./actions";

const MAX_BYTES = 5 * 1024 * 1024; // matches the bucket's file_size_limit
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const paiseToInput = (paise: number | undefined) =>
  paise === undefined ? "" : (paise / 100).toFixed(2).replace(/\.00$/, "");

export function ProductForm({
  merchantId,
  product,
}: {
  merchantId: string;
  product?: AdminProduct;
}) {
  const router = useRouter();
  const [imagePath, setImagePath] = useState(product?.image_path ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();

  const specs = Array.isArray(product?.specs)
    ? product.specs.filter((s): s is string => typeof s === "string").join("\n")
    : "";

  // Uploads straight to Storage as the signed-in admin. The bucket enforces type
  // and size; storage RLS restricts writes to this merchant's folder.
  const upload = async (file: File) => {
    const ext = TYPES[file.type];
    if (!ext) {
      setError("Use a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Images must be 5 MB or smaller.");
      return;
    }
    setError(null);
    setUploading(true);
    const path = `${merchantId}/products/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await createClient()
      .storage.from("product-images")
      .upload(path, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (uploadError) {
      setError("Upload failed. Please try again.");
      return;
    }
    setImagePath(path);
  };

  const submit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => {
      const v = fd.get(k);
      return typeof v === "string" ? v : "";
    };
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await saveProduct({
        ...(product ? { id: product.id } : {}),
        sku: get("sku"),
        name: get("name"),
        shortName: get("shortName"),
        category: get("category"),
        description: get("description"),
        specs: get("specs"),
        listPrice: get("listPrice"),
        salePrice: get("salePrice"),
        imagePath,
        active: fd.get("active") === "on",
      });
      if (result.ok) {
        toast.success(product ? "Product saved." : "Product created.");
        router.push("/staff/catalog");
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  };

  const err = (k: string) => fieldErrors[k]?.map((message) => ({ message })) ?? [];
  const field = (
    name: string,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
    hint?: string,
  ) => (
    <Field data-invalid={fieldErrors[name] ? true : undefined}>
      <FieldLabel htmlFor={`p-${name}`}>{label}</FieldLabel>
      <Input
        id={`p-${name}`}
        name={name}
        aria-invalid={fieldErrors[name] ? true : undefined}
        {...props}
      />
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
      <FieldError errors={err(name)} />
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <Card>
        <CardContent className="pt-6">
          <FieldGroup>
            {error ? <FormMessage status="error" message={error} /> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              {field("sku", "SKU", {
                defaultValue: product?.sku ?? "",
                autoCapitalize: "characters",
                className: "font-mono",
              })}
              {field(
                "category",
                "Category",
                { defaultValue: product?.category ?? "" },
                "e.g. bags, phones",
              )}
            </div>
            {field("name", "Name", { defaultValue: product?.name ?? "" })}
            {field("shortName", "Short name (optional)", {
              defaultValue: product?.short_name ?? "",
            })}
            <div className="grid gap-4 sm:grid-cols-2">
              {field("listPrice", "List price (₹)", {
                defaultValue: paiseToInput(product?.list_price_paise),
                inputMode: "decimal",
              })}
              {field("salePrice", "Sale price (₹)", {
                defaultValue: paiseToInput(product?.sale_price_paise),
                inputMode: "decimal",
              })}
            </div>
            <Field data-invalid={fieldErrors.description ? true : undefined}>
              <FieldLabel htmlFor="p-description">Description (optional)</FieldLabel>
              <textarea
                id="p-description"
                name="description"
                defaultValue={product?.description ?? ""}
                rows={3}
                className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm"
              />
              <FieldError errors={err("description")} />
            </Field>
            <Field data-invalid={fieldErrors.specs ? true : undefined}>
              <FieldLabel htmlFor="p-specs">Specifications</FieldLabel>
              <textarea
                id="p-specs"
                name="specs"
                defaultValue={specs}
                rows={5}
                className="rounded-lg border border-input bg-background px-2.5 py-1.5 font-mono text-xs"
              />
              <FieldDescription>One per line, up to 20.</FieldDescription>
              <FieldError errors={err("specs")} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={product?.active ?? true} />
              Live in the shop
            </label>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <ProductImage
              path={imagePath || null}
              alt="Product image preview"
              sizes="288px"
              className="border"
            />
            <label
              htmlFor="p-image"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-2 text-sm hover:bg-muted"
            >
              <ImageUpIcon className="size-4" aria-hidden />
              {uploading ? "Uploading…" : imagePath ? "Replace image" : "Upload image"}
            </label>
            <input
              id="p-image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 5 MB.</p>
            <FieldError errors={err("imagePath")} />
          </CardContent>
        </Card>
        <Button type="submit" size="lg" disabled={pending || uploading}>
          {pending ? "Saving…" : product ? "Save changes" : "Create product"}
        </Button>
      </div>
    </form>
  );
}
