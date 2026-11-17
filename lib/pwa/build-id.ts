/** The build this server is running: the deployment on Vercel, else the commit, else "dev" (card 1ff9465d). */
export function buildId(): string {
  return process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "dev"
}
