"use client";

import { SignIn, useUser } from "@stackframe/stack";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SignInPage() {
  const user = useUser();
  const router = useRouter();

  // Redirect to dashboard if already signed in
  useEffect(() => {
    if (user) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  // Show loading while checking auth or redirecting
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="text-white">Redirecting to dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Mission Control
          </h1>
          <p className="text-gray-400">
            Sign in to manage your AI projects
          </p>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
          <SignIn fullPage={false} />
        </div>

        <p className="text-center text-gray-400 mt-6">
          Don&apos;t have an account?{" "}
          <Link
            href="/sign-up"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
