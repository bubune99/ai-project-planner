"use client";

import { signOut } from "@/app/(auth)/auth";

export const SignOutForm = () => {
  const handleSignOut = async () => {
    await signOut();
    // Redirect after sign out
    window.location.href = "/";
  };

  return (
    <form action={handleSignOut} className="w-full">
      <button
        className="w-full px-1 py-0.5 text-left text-red-500"
        type="submit"
      >
        Sign out
      </button>
    </form>
  );
};
