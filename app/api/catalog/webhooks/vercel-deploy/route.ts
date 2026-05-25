/**
 * /api/catalog/webhooks/vercel-deploy — Idea H Wave 4 (belt-and-suspenders)
 *
 * Receives Vercel deployment events. On `deployment.ready` for production, fires
 * the same targeted-scan path the GitHub webhook uses. This catches the edge
 * case where the GitHub webhook missed/failed but a deploy still went through —
 * AND it ensures the catalog reflects what actually deployed (not just what
 * was committed).
 *
 * Setup (one-time):
 *  1. Vercel project settings → Webhooks → Add
 *  2. URL: https://v0-ai-project-planner-eight.vercel.app/api/catalog/webhooks/vercel-deploy
 *  3. Events: deployment.succeeded (or deployment.ready)
 *  4. Secret: set to VERCEL_WEBHOOK_SECRET env var
 *
 * Vercel signs payloads with a different scheme than GitHub.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { logScanEvent, eventExistsForCommit } from '@/lib/catalog/audit-logger'

export const dynamic = 'force-dynamic'

interface VercelDeploymentPayload {
  id: string
  type: string                   // 'deployment.succeeded' | 'deployment.ready' | etc.
  createdAt: number
  region?: string
  payload: {
    deployment: {
      id: string
      url: string
      meta?: {
        githubCommitSha?: string
        githubCommitRef?: string
        githubCommitMessage?: string
        githubCommitAuthorName?: string
        githubRepoFullName?: string
      }
    }
    project?: { id: string; name: string }
    target?: 'production' | 'preview' | null
  }
}

function verifyVercelSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false
  const expected = createHmac('sha1', secret).update(rawBody).digest('hex')
  if (expected.length !== signatureHeader.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signatureHeader, 'hex'))
  } catch {
    return false
  }
}

function resolveCatalogOwner(_payload: VercelDeploymentPayload): string | null {
  return process.env.CATALOG_DEFAULT_USER_ID ?? null
}

export async function POST(request: NextRequest) {
  let body: VercelDeploymentPayload | null = null
  let userId: string | null = null
  try {
    const raw = await request.text()

    const secret = process.env.VERCEL_WEBHOOK_SECRET
    const signature = request.headers.get('x-vercel-signature')
    if (secret) {
      if (!verifyVercelSignature(raw, signature, secret)) {
        return errorResponse(ErrorCodes.UNAUTHORIZED, 'Invalid Vercel signature', 401)
      }
    } else if (process.env.NODE_ENV === 'production') {
      return errorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'VERCEL_WEBHOOK_SECRET not configured',
        500
      )
    }

    try {
      body = JSON.parse(raw) as VercelDeploymentPayload
    } catch {
      return errorResponse(ErrorCodes.BAD_REQUEST, 'Invalid JSON body', 400)
    }

    // Only act on successful production deployments
    if (
      body.type !== 'deployment.succeeded' &&
      body.type !== 'deployment.ready'
    ) {
      return successResponse({ ignored: true, reason: `event '${body.type}' not handled` })
    }
    if (body.payload?.target !== 'production') {
      return successResponse({ ignored: true, reason: 'non-production deployment' })
    }

    userId = resolveCatalogOwner(body)
    if (!userId) {
      return errorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'No catalog owner resolved (set CATALOG_DEFAULT_USER_ID)',
        500
      )
    }

    const commitSha = body.payload?.deployment?.meta?.githubCommitSha ?? null
    const branch = body.payload?.deployment?.meta?.githubCommitRef ?? null

    if (!commitSha) {
      return successResponse({
        ignored: true,
        reason: 'No commit SHA in deployment meta (non-git deployment?)',
      })
    }

    // Idempotency — the GitHub webhook usually fires first; this is the second pair
    // of eyes. If GitHub already processed this commit, log a SKIPPED event with
    // the dedup reason so the audit trail captures "Vercel saw it too."
    const alreadyHandled = await eventExistsForCommit(userId, commitSha, 'github_webhook')
    if (alreadyHandled) {
      const eventId = await logScanEvent({
        userId,
        commitSha,
        branch,
        scanType: 'skipped',
        skipReason: 'Already processed via github_webhook (vercel_deploy belt-and-suspenders confirmation)',
        triggeredBy: 'vercel_deploy',
        metadata: {
          deployment_id: body.payload?.deployment?.id,
          deployment_url: body.payload?.deployment?.url,
          repo: body.payload?.deployment?.meta?.githubRepoFullName,
        },
      })
      return successResponse({
        scanned: false,
        deduped: true,
        event_id: eventId,
        commit_sha: commitSha,
      })
    }

    // GitHub webhook didn't reach us for this commit — fire a targeted-scan event
    // with empty file list (we don't have the diff from Vercel). The scanner can
    // be invoked separately via catalog_scan_now({scope:'targeted', commitSha}).
    const eventId = await logScanEvent({
      userId,
      commitSha,
      branch,
      scanType: 'targeted',
      scannedFiles: [],
      surfacesAdded: [],
      surfacesModified: [],
      surfacesRemoved: [],
      scanDurationMs: null,
      triggeredBy: 'vercel_deploy',
      metadata: {
        deployment_id: body.payload?.deployment?.id,
        deployment_url: body.payload?.deployment?.url,
        repo: body.payload?.deployment?.meta?.githubRepoFullName,
        note: 'GitHub webhook missed; Vercel caught it. Run catalog_scan_now({commitSha}) to backfill surface diff.',
      },
    })

    return successResponse({
      scanned: false,
      backfill_needed: true,
      event_id: eventId,
      commit_sha: commitSha,
      branch,
    })
  } catch (error) {
    console.error('POST /api/catalog/webhooks/vercel-deploy error:', error)
    return errorResponse(
      ErrorCodes.INTERNAL_ERROR,
      'Vercel webhook processing failed',
      500,
      { message: error instanceof Error ? error.message : 'unknown' }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    webhook: 'catalog/vercel-deploy',
    ready: true,
    requires: ['VERCEL_WEBHOOK_SECRET', 'CATALOG_DEFAULT_USER_ID'],
    note: 'POST a Vercel deployment payload to trigger.',
  })
}
