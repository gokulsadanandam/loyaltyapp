import { describe, expect, it } from "vitest";

import { formToObject, resetPasswordSchema, signupSchema } from "./auth";

const valid = {
  firstName: " Asha ",
  lastName: "",
  email: "Asha@Example.com",
  phone: "",
  password: "Password123",
  referralCode: "",
};

describe("signupSchema", () => {
  it("normalises input and drops empty optionals", () => {
    const parsed = signupSchema.parse(valid);
    expect(parsed).toEqual({
      firstName: "Asha",
      email: "asha@example.com",
      password: "Password123",
    });
  });

  it("enforces the Supabase password policy (letters + digits, 8+)", () => {
    for (const password of ["short1", "allletters", "12345678"]) {
      expect(signupSchema.safeParse({ ...valid, password }).success).toBe(false);
    }
  });

  it("uses the same phone pattern as the profiles CHECK constraint", () => {
    expect(signupSchema.safeParse({ ...valid, phone: "+91 98765 43210" }).success).toBe(true);
    expect(signupSchema.safeParse({ ...valid, phone: "call me" }).success).toBe(false);
  });

  it("rejects referral codes with symbols", () => {
    expect(signupSchema.safeParse({ ...valid, referralCode: "AB-12" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("requires matching passwords", () => {
    const result = resetPasswordSchema.safeParse({
      password: "Password123",
      confirm: "Password124",
    });
    expect(result.success).toBe(false);
  });
});

describe("formToObject", () => {
  it("keeps the first string value per key and ignores files", () => {
    const fd = new FormData();
    fd.append("a", "1");
    fd.append("a", "2");
    fd.append("f", new Blob(["x"]));
    expect(formToObject(fd)).toEqual({ a: "1" });
  });
});
