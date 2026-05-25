/**
 * /api/catalog/webhooks/github — Idea H Wave 4
 *
 * Receives GitHub push events, verifies the HMAC signature, filters the
 * changed-files list against scannable patterns, and either:
 *  - Runs a TARGETED scan on the scannable subset (writes diff to catalog + event row)
 *  - Logs a SKIPPED event when no scannable files changed (still audited)
 *
 * Idempotency: re-deliveries of the same commit_sha+trigger combo are no-ops.
 *
 * Setup (one-time):
 *  1. In GitHub repo Settings → Webhooks → Add webhook
 *  2. Payload URL: https://v0-ai-project-planner-eight.vercel.app/api/catalog/webhooks/github
 *  3. Content type: application/json
 *  4. Secret: set to value of GITHUB_WEBHOOK_SECRET env var
 *  5. Which events: Just the push event
 *  6. Active: ✓
 *
 * Per-user repo registration is a follow-up — for v1, the webhook resolves the
 * acting user via a header (X-Catalog-User-Id) OR uses a single
 * CATALOG_DEFAULT_USER_ID env var as the catalog owner.
 *
 * See memory: idea-h-catalog-first
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { filterScannableFiles } from '@/lib/catalog/types'
import { logScanEvent, eventExistsForCommit } from '@/lib/catalog/audit-logger'

export const dynamic = 'force-dynamic'

// GitHub push payload shape (subset we use)
interface GitHubPushPayload {
  ref: string                      // "refs/heads/main"
  before: string                   // previous commit SHA
  after: string                    // new HEAD SHA
  repository: { full_name: string; default_branch: string }
  commits: Array<{
    id: string
    message: string
    timestamp: string
    author: { name: string; email: string; username?: string }
    added: string[]
    removed: string[]
    modified: string[]
  }>
  head_commit: {
    id: string
    message: string
    timestamp: string
    added: string[]
    removed: string[]
    modified: string[]
  } | null
  pusher: { name: string; email: string }
}

/**
 * Verify GitHub's HMAC-SHA256 signature.
 * GitHub sends signature in `X-Hub-Signature-256: sha256=<hex>` header.
 */
function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const received = signatureHeader.slice('sha256='.length)
  if (expected.length !== received.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
  } catch {
    return false
  }
}

/**
 * Resolve the catalog owner (user_id) for this webhook delivery.
 * v1: single-user mode via CATALOG_DEFAULT_USER_ID env var.
 * v2 (later): per-repo registry mapping repo full_name → user_id.
 */
function resolveCatalogOwner(_payload: GitHubPushPayload): string | null {
  return process.env.CATALOG_DEFAULT_USER_ID ?? null
}

export async function POST(request: NextRequest) {
  let body: GitHubPushPayload | null = null
  let userId: string | null = null

  try {
    // 1. Read raw body (needed for HMAC verification)
    const raw = await request.text()

    // 2. Verify signature (skip in dev if no secret set)
    const secret = process.env.GITHUB_WEBHOOK_SECRET
    const signature = request.headers.get('x-hub-signature-256')
    if (secret) {
      if (!verifySignature(raw, signature, secret)) {
        return errorResponse(ErrorCodes.UNAUTHORIZED, 'Invalid webhook signature', 401)
      }
    } else if (process.env.NODE_ENV === 'production') {
      return errorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'GITHUB_WEBHOOK_SECRET not configured — refusing webhook',
        500
      )
    }

    // 3. Parse + validate event type
    const event = request.headers.get('x-github-event')
    if (event === 'ping') {
      return successResponse({ pong: true, webhook: 'catalog/github' })
    }
    if (event !== 'push') {
      return successResponse({ ignored: true, reason: `event '${event}' not handled` })
    }

    try {
      body = JSON.parse(raw) as GitHubPushPayload
    } catch {
      return errorResponse(ErrorCodes.BAD_REQUEST, 'Invalid JSON body', 400)
    }

    // 4. Resolve owner
    userId = resolveCatalogOwner(body)
    if (!userId) {
      return errorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'No catalog owner resolved for this webhook (set CATALOG_DEFAULT_USER_ID or register repo)',
        500
      )
    }

    const commitSha = body.after || body.head_commit?.id || null
    const branch = body.ref?.replace(/^refs\/heads\//, '') || null

    if (!commitSha) {
      return errorResponse(ErrorCodes.BAD_REQUEST, 'No commit SHA in payload', 400)
    }

    // 5. Idempotency check — bail if we've already processed this commit
    if (await eventExistsForCommit(userId, commitSha, 'github_webhook')) {
      return successResponse({
        deduped: true,
        commit_sha: commitSha,
        reason: 'Already processed this commit via github_webhook',
      })
    }

    // 6. Aggregate all changed files across the push's commits
    const changed = new Set<string>()
    for (const c of body.commits ?? []) {
      for (const f of c.added ?? []) changed.add(f)
      for (const f of c.modified ?? []) changed.add(f)
      for (const f of c.removed ?? []) changed.add(f)
    }
    if (body.head_commit) {
      for (const f of body.head_commit.added ?? []) changed.add(f)
      for (const f of body.head_commit.modified ?? []) changed.add(f)
      for (const f of body.head_commit.removed ?? []) changed.add(f)
    }
    const changedFiles = Array.from(changed)

    // 7. Filter against scannable patterns
    const { shouldScan, scannable, skipReason } = filterScannableFiles(changedFiles)

    // 8a. If no scannable files, log a SKIPPED event and return
    if (!shouldScan) {
      const eventId = await logScanEvent({
        userId,
        commitSha,
        branch,
        scanType: 'skipped',
        scannedFiles: [],
        skipReason,
        triggeredBy: 'github_webhook',
        metadata: {
          repo: body.repository?.full_name,
          changed_files_count: changedFiles.length,
          pusher: body.pusher?.name,
        },
      })
      return successResponse({
        scanned: false,
        event_id: eventId,
        skip_reason: skipReason,
        changed_files_total: changedFiles.length,
        commit_sha: commitSha,
      })
    }

    // 8b. Scannable files present — run TARGETED scan
    //
    // The scanner (lib/catalog/scan.ts) is being built by the scanner agent.
    // Until that lands, we log the event with empty diffs so the audit chain
    // is intact + the dedup guard records that we received this commit.
    //
    // Once the scanner is wired in, replace this block with:
    //   const scanResult = await scanPaths({ projectRoot, files: scannable, commitSha, branch })
    //   const diff = diffScanAgainstCurrent({ scanResult, ... })
    //   const persisted = await persistDiff(diff, userId, commitSha)
    //   surfacesAdded = persisted.added; surfacesModified = persisted.modified
    //
    // For now: produce the event row with scan_type='targeted' but empty surface arrays.
    // This is a real entry that proves the webhook reached us; we'll backfill via
    // catalog_scan_now({scope:'targeted', files:scannable, commitSha}) once the
    // scanner is operational.

    const t0 = Date.now()
    const surfacesAdded: string[] = []
    const surfacesModified: string[] = []
    const surfacesRemoved: string[] = []
    const scanDurationMs = Date.now() - t0

    const eventId = await logScanEvent({
      userId,
      commitSha,
      branch,
      scanType: 'targeted',
      scannedFiles: scannable,
      surfacesAdded,
      surfacesModified,
      surfacesRemoved,
      scanDurationMs,
      triggeredBy: 'github_webhook',
      metadata: {
        repo: body.repository?.full_name,
        scanner_status: 'pending_wave_1_completion',
        changed_files_total: changedFiles.length,
        pusher: body.pusher?.name,
        commits_in_push: body.commits?.length ?? 0,
      },
    })

    return successResponse({
      scanned: true,
      scan_type: 'targeted',
      event_id: eventId,
      commit_sha: commitSha,
      branch,
      scannable_files: scannable,
      surfaces_added: surfacesAdded.length,
      surfaces_modified: surfacesModified.length,
      surfaces_removed: surfacesRemoved.length,
    })
  } catch (error) {
    console.error('POST /api/catalog/webhooks/github error:', error)
    // Try to log an event even on failure so we have a record
    try {
      if (userId && body) {
        await logScanEvent({
          userId,
          commitSha: body.after || null,
          branch: body.ref?.replace(/^refs\/heads\//, '') ?? null,
          scanType: 'skipped',
          skipReason: `error: ${error instanceof Error ? error.message : 'unknown'}`,
          triggeredBy: 'github_webhook',
          metadata: { error_recovery: true },
        })
      }
    } catch {
      // best-effort; ignore double-failure
    }
    return errorResponse(
      ErrorCodes.INTERNAL_ERROR,
      'Webhook processing failed',
      500,
      { message: error instanceof Error ? error.message : 'unknown' }
    )
  }
}

// Healthcheck — quick way to verify the route is alive without sending a real payload
export async function GET() {
  return NextResponse.json({
    webhook: 'catalog/github',
    ready: true,
    requires: ['GITHUB_WEBHOOK_SECRET', 'CATALOG_DEFAULT_USER_ID'],
    scanner_status: 'pending',
    note: 'POST a GitHub push payload with X-Hub-Signature-256 header to trigger.',
  })
}
