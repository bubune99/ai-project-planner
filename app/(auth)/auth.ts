"use server";

import { stackServerApp } from "@/lib/auth/stack-auth";
import { redirect } from "next/navigation";

/**
 * Auth actions using Stack Auth
 */

export async function signOut(): Promise<void> {
  const user = await stackServerApp.getUser();
  if (user) {
    await user.signOut();
  }
  redirect("/sign-in");
}

export async function getCurrentUser() {
  return await stackServerApp.getUser();
}
