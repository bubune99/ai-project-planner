/**
 * Which copy of the planner a hostname is. Pure; checked in which-site.assert.ts.
 * Anything that is not known to be production says so on screen (components/layout/StagingMark.tsx).
 */
export const PRODUCTION_HOSTS = ["v0-ai-project-planner-eight.vercel.app"]
export const STAGING_HOSTS = ["v0-ai-project-planner-git-staging-far-grace.vercel.app"]

export function whichSite(hostname: string): "production" | "staging" | "preview" | "local" {
  const h = (hostname || "").toLowerCase().replace(/\.$/, "")
  if (PRODUCTION_HOSTS.includes(h)) return "production"
  if (STAGING_HOSTS.includes(h)) return "staging"
  if (h === "localhost" || h === "127.0.0.1" || h.endsWith(".local")) return "local"
  // Any other Vercel address is a single build's own address. A custom domain we do not know is treated as
  // production: wrongly marking the live site "not live" would be the worse mistake.
  if (h.endsWith(".vercel.app")) return "preview"
  return "production"
}
