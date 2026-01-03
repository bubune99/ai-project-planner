/**
 * Stack Auth Handler Page
 *
 * This page handles all Stack Auth routes:
 * - /handler/signin
 * - /handler/signup
 * - /handler/signout
 * - /handler/account-settings
 * - /handler/forgot-password
 * - /handler/password-reset
 * - /handler/email-verification
 * - etc.
 */

import { StackHandler } from "@stackframe/stack";
import { stackServerApp } from "@/lib/auth/stack-auth";

export default function Handler(props: { params: Promise<{ stack: string[] }> }) {
  return <StackHandler fullPage app={stackServerApp} />;
}
