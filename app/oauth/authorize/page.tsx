/**
 * OAuth 2.1 Authorization Endpoint (consent screen) — /oauth/authorize
 *
 * This is the human-facing step of the MCP custom-connector flow:
 *   1. Validate the OAuth request (client, redirect_uri, PKCE S256).
 *   2. Require a Stack Auth session — if absent, bounce through sign-in and
 *      come straight back here (params preserved via after_auth_return_to).
 *   3. Show a consent screen ("Allow <client> to access your planner?").
 *   4. On Approve, mint a single-use PKCE-bound auth code and 302 to the
 *      client's redirect_uri with ?code=&state=. On Deny, return access_denied.
 *
 * Public route (whitelisted in middleware) — it performs its own session gate so
 * it can control the sign-in return URL instead of middleware redirecting and
 * dropping the OAuth params.
 */

import type { CSSProperties } from "react"
import { redirect } from "next/navigation"
import { stackServerApp, ensureDbUser } from "@/lib/auth/stack-auth"
import { getClient, redirectUriAllowed, issueAuthCode } from "@/lib/oauth/store"

export const dynamic = "force-dynamic"

type SearchParams = Record<string, string | string[] | undefined>

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "")
}

/** Build a redirect back to the client with OAuth error params (RFC 6749 §4.1.2.1). */
function errorRedirect(redirectUri: string, state: string, error: string, desc: string): never {
  const u = new URL(redirectUri)
  u.searchParams.set("error", error)
  u.searchParams.set("error_description", desc)
  if (state) u.searchParams.set("state", state)
  redirect(u.toString())
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

  const responseType = first(params.response_type)
  const clientId = first(params.client_id)
  const redirectUri = first(params.redirect_uri)
  const scope = first(params.scope) || "read write"
  const state = first(params.state)
  const codeChallenge = first(params.code_challenge)
  const codeChallengeMethod = first(params.code_challenge_method) || "S256"
  const resource = first(params.resource)

  // ---- Validate client + redirect_uri FIRST (before any redirect back) ----
  const client = clientId ? await getClient(clientId) : null
  if (!client) {
    return <ErrorCard title="Unknown client" detail="This connector's client_id is not registered. Try removing and re-adding the connector." />
  }
  if (!redirectUri || !redirectUriAllowed(client, redirectUri)) {
    return <ErrorCard title="Invalid redirect URI" detail="The redirect URI does not match what this connector registered." />
  }

  // From here, parameter errors are safe to report back to the client redirect.
  if (responseType !== "code") {
    errorRedirect(redirectUri, state, "unsupported_response_type", "Only response_type=code is supported")
  }
  if (!codeChallenge) {
    errorRedirect(redirectUri, state, "invalid_request", "PKCE code_challenge is required")
  }
  if (codeChallengeMethod !== "S256") {
    errorRedirect(redirectUri, state, "invalid_request", "Only code_challenge_method=S256 is supported")
  }

  // ---- Session gate ----
  const user = await stackServerApp.getUser()
  if (!user) {
    const selfUrl = `/oauth/authorize?${new URLSearchParams(
      Object.fromEntries(
        Object.entries({
          response_type: responseType,
          client_id: clientId,
          redirect_uri: redirectUri,
          scope,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          resource,
        }).filter(([, v]) => v),
      ),
    ).toString()}`
    redirect(`/handler/sign-in?after_auth_return_to=${encodeURIComponent(selfUrl)}`)
  }

  const dbUser = await ensureDbUser()
  if (!dbUser) {
    errorRedirect(redirectUri, state, "server_error", "Could not resolve user account")
  }

  // ---- Consent screen ----
  const clientLabel = client.client_name || clientId
  const redirectHost = (() => {
    try { return new URL(redirectUri).host || redirectUri } catch { return redirectUri }
  })()

  // Server action: approve -> mint code -> redirect to client.
  async function approve() {
    "use server"
    // Re-validate everything inside the action (never trust the round trip).
    const c = await getClient(clientId)
    if (!c || !redirectUriAllowed(c, redirectUri)) {
      throw new Error("OAuth client/redirect validation failed")
    }
    const u = await stackServerApp.getUser()
    if (!u) {
      redirect(`/handler/sign-in?after_auth_return_to=${encodeURIComponent("/oauth/authorize")}`)
    }
    const dbu = await ensureDbUser()
    if (!dbu) throw new Error("Could not resolve user account")

    const code = await issueAuthCode({
      clientId,
      userId: dbu.id,
      redirectUri,
      scope,
      resource: resource || null,
      codeChallenge,
      codeChallengeMethod,
    })
    const back = new URL(redirectUri)
    back.searchParams.set("code", code)
    if (state) back.searchParams.set("state", state)
    redirect(back.toString())
  }

  // Server action: deny -> redirect with access_denied.
  async function deny() {
    "use server"
    const back = new URL(redirectUri)
    back.searchParams.set("error", "access_denied")
    back.searchParams.set("error_description", "User denied the authorization request")
    if (state) back.searchParams.set("state", state)
    redirect(back.toString())
  }

  const scopeList = scope.split(/\s+/).filter(Boolean)

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.kicker}>AUTHORIZE CONNECTOR</div>
        <h1 style={styles.h1}>
          Allow <span style={styles.accent}>{clientLabel}</span> to access your AI Project Planner?
        </h1>
        <p style={styles.sub}>
          Signed in as <strong>{user.primaryEmail || dbUser.email}</strong>
        </p>

        <div style={styles.panel}>
          <div style={styles.panelRow}>
            <span style={styles.panelKey}>Will be able to</span>
            <span style={styles.panelVal}>
              {scopeList.includes("write")
                ? "Read and write your projects, todos, ideas, documents, and catalog"
                : "Read your projects, todos, ideas, documents, and catalog"}
            </span>
          </div>
          <div style={styles.panelRow}>
            <span style={styles.panelKey}>Scopes</span>
            <span style={styles.panelVal}>{scopeList.join(", ") || "read"}</span>
          </div>
          <div style={styles.panelRow}>
            <span style={styles.panelKey}>Redirects to</span>
            <span style={styles.panelVal}>{redirectHost}</span>
          </div>
        </div>

        <p style={styles.fine}>
          Approving creates a scoped API key bound to your account. You can revoke
          it anytime from Settings → API Keys. Only approve connectors you trust.
        </p>

        <div style={styles.actions}>
          <form action={deny}>
            <button type="submit" style={styles.btnGhost}>Deny</button>
          </form>
          <form action={approve}>
            <button type="submit" style={styles.btnPrimary}>Approve</button>
          </form>
        </div>
      </div>
    </div>
  )
}

function ErrorCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={{ ...styles.kicker, color: "#f87171" }}>AUTHORIZATION ERROR</div>
        <h1 style={styles.h1}>{title}</h1>
        <p style={styles.sub}>{detail}</p>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0a0a0b",
    padding: "24px",
    fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
  },
  card: {
    width: "100%",
    maxWidth: 460,
    background: "#141416",
    border: "1px solid #2a2a2e",
    borderRadius: 16,
    padding: "32px",
    color: "#e7e7ea",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  kicker: { fontSize: 11, letterSpacing: "0.14em", color: "#8b8b93", marginBottom: 14, fontWeight: 600 },
  h1: { fontSize: 22, lineHeight: 1.3, margin: "0 0 8px", fontWeight: 650 },
  accent: { color: "#7c9cff" },
  sub: { fontSize: 14, color: "#a1a1aa", margin: "0 0 20px" },
  panel: { background: "#0e0e10", border: "1px solid #232327", borderRadius: 12, padding: 16, marginBottom: 18 },
  panelRow: { display: "flex", gap: 12, padding: "6px 0", fontSize: 13 },
  panelKey: { color: "#8b8b93", minWidth: 96 },
  panelVal: { color: "#d4d4d8", flex: 1 },
  fine: { fontSize: 12, color: "#8b8b93", lineHeight: 1.5, marginBottom: 22 },
  actions: { display: "flex", gap: 12, justifyContent: "flex-end" },
  btnGhost: {
    padding: "10px 18px", borderRadius: 10, border: "1px solid #34343a",
    background: "transparent", color: "#d4d4d8", fontSize: 14, cursor: "pointer", fontWeight: 550,
  },
  btnPrimary: {
    padding: "10px 22px", borderRadius: 10, border: "1px solid #4f6bff",
    background: "#3b5bff", color: "white", fontSize: 14, cursor: "pointer", fontWeight: 600,
  },
}
