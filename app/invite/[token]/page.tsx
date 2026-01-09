import { Suspense } from "react";
import { stackServerApp } from "@/lib/auth/stack-auth";
import { InviteAcceptClient } from "./InviteAcceptClient";
import { Loader2, Rocket } from "lucide-react";
import Link from "next/link";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;

  // Check if user is logged in
  let isLoggedIn = false;
  try {
    const user = await stackServerApp.getUser();
    isLoggedIn = !!user;
  } catch {
    // User not logged in
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 container mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Rocket className="h-8 w-8 text-blue-500" />
            <span className="text-2xl font-bold text-white">Mission Control</span>
          </Link>
          {!isLoggedIn && (
            <div className="flex items-center gap-4">
              <Link
                href={`/sign-in?redirect=/invite/${token}`}
                className="text-gray-300 hover:text-white transition-colors"
              >
                Sign In
              </Link>
              <Link
                href={`/sign-up?redirect=/invite/${token}`}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Main content */}
      <div className="relative z-10 container mx-auto px-6 py-16">
        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-gray-400">Loading invitation...</p>
            </div>
          }
        >
          <InviteAcceptClient token={token} isLoggedIn={isLoggedIn} />
        </Suspense>
      </div>
    </div>
  );
}
