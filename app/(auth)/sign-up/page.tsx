"use client";

import { SignUp } from "@stackframe/stack";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Mission Control
          </h1>
          <p className="text-gray-400">
            Create an account to get started
          </p>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
          <SignUp fullPage={false} />
        </div>

        <p className="text-center text-gray-400 mt-6">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
