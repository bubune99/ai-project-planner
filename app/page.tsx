import Link from "next/link";
import { stackServerApp } from "@/lib/auth/stack-auth";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  try {
    const user = await stackServerApp.getUser();
    if (user) {
      redirect("/dashboard");
    }
  } catch {
    console.warn("Auth check failed on landing page, showing public view");
  }

  return (
    <div style={{ minHeight: "100vh", background: "oklch(0.110 0.028 268)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      {/* Radial glow */}
      <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse 80% 50% at 50% -10%, oklch(0.870 0.045 252 / 0.12), transparent)", pointerEvents: "none" }} />

      <div style={{ position: "relative", maxWidth: 480, width: "100%", textAlign: "center" }}>
        {/* Logo mark */}
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "oklch(0.870 0.045 252 / 0.15)", boxShadow: "0 0 0 1px oklch(0.870 0.045 252 / 0.3), 0 0 40px oklch(0.870 0.045 252 / 0.15)", display: "grid", placeItems: "center", margin: "0 auto 24px", fontSize: 24 }}>
          ◈
        </div>

        <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "oklch(0.870 0.045 252)", marginBottom: 12 }}>Central Nervous System</p>
        <h1 style={{ fontSize: 36, fontWeight: 500, letterSpacing: "-0.03em", color: "oklch(0.985 0 0)", margin: "0 0 12px" }}>JARVIS</h1>
        <p style={{ fontSize: 14, color: "oklch(0.556 0 0)", margin: "0 0 40px", lineHeight: 1.6 }}>
          Your businesses, projects, and agents — unified.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Link
            href="/sign-in"
            style={{ padding: "10px 24px", background: "oklch(0.870 0.045 252)", color: "oklch(0.110 0.028 268)", borderRadius: 8, fontWeight: 500, fontSize: 14, textDecoration: "none", letterSpacing: "-0.01em" }}
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            style={{ padding: "10px 24px", background: "oklch(1 0 0 / 0.06)", color: "oklch(0.860 0 0)", borderRadius: 8, fontWeight: 500, fontSize: 14, textDecoration: "none", boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.12)", letterSpacing: "-0.01em" }}
          >
            Create account
          </Link>
        </div>

        <p style={{ marginTop: 48, fontSize: 11, color: "oklch(0.360 0 0)" }}>faridea.dev · {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
