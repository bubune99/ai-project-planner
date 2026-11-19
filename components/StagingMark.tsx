/**
 * A small "Staging" tab at the top of every page on a preview deployment (the staging site), and nothing on
 * production. Found 2026-11-14: staging and production looked identical, so the owner commented on staging thinking
 * it was production, and his waiting questions "vanished" (task 99434bc2). It never takes a press: pointer-events none.
 */
export function StagingMark() {
  if (process.env.VERCEL_ENV !== "preview") return null
  return (
    <div
      data-staging-mark=""
      aria-label="This is the staging site"
      style={{
        position: "fixed",
        top: 0,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2147483000,
        pointerEvents: "none",
        padding: "1px 12px 3px",
        borderRadius: "0 0 8px 8px",
        background: "#f59e0b",
        color: "#1c1917",
        fontSize: 12,
        fontWeight: 600,
        lineHeight: "16px",
      }}
    >
      Staging
    </div>
  )
}
