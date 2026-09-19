"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isAdminRole } from "@gas-station/types";
import { createClient } from "@/lib/supabase/server";

const signInSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address.").email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export interface SignInState {
  error?: string;
}

export async function signInAction(_prevState: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your input and try again." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    return { error: "Incorrect email or password." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .single();

  if (!profile || !isAdminRole(profile.role)) {
    // Not a fake permission check: RLS would already block this account
    // from reading almost everything, but signing them straight back out
    // here gives a clear message instead of a confusing empty dashboard.
    await supabase.auth.signOut();
    return { error: "This account doesn't have access to the admin dashboard." };
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    return { error: "This account has been deactivated. Contact an owner or manager." };
  }

  redirect("/dashboard");
}
