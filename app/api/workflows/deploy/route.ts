/**
 * POST /api/workflows/deploy
 *
 * Dedicated proxy for workflow deployment requests.
 * Forwards to VPS Bridge → /workflows/deploy.
 *
 * Request body:
 *   {
 *     session_id:             string   (required)
 *     organization_id:        string   (required)
 *     user_request:           string   (required)
 *     conversation_history?:  array    (optional)
 *     workflow_name?:         string   (optional)
 *   }
 *
 * Success response (200):
 *   { draftId: string | null, buildStatus: string, steps: unknown[] }
 *
 * Error response:
 *   { error: { code: string, message: string, details?: unknown } }
 */

import { NextRequest, NextResponse } from 'next/server'

// ── Config ────────────────────────────────────────────────────────────────────

const VPS_BRIDGE_URL = (
  process.env.VPS_BRIDGE_URL ||
  process.env.NEXT_PUBLIC_VPS_BRIDGE_URL ||
  'http://43.156.108.96:3003'
).replace(/\/$/, '')

const VPS_BRIDGE_API_KEY =
  process.env.VPS_BRIDGE_API_KEY ||
  process.env.NEXT_PUBLIC_VPS_BRIDGE_API_KEY ||
  ''

const UPSTREAM_PATH = '/workflows/deploy'
const TIMEOUT_MS    = 30_000

// ── Types ─────────────────────────────────────────────────────────────────────

interface DeployRequestBody {
  session_id:            string
  organization_id:       string
  user_request:          string
  conversation_history?: unknown[]
  workflow_name?:        string
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Parse & validate body ──────────────────────────────────────────────
  let body: DeployRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } },
      { status: 400 }
    )
  }

  const {
    session_id,
    organization_id,
    user_request,
    conversation_history,
    workflow_name,
  } = body

  if (!session_id || typeof session_id !== 'string') {
    return NextResponse.json(
      {
        error: {
          code:    'BAD_REQUEST',
          message: 'session_id, organization_id, and user_request are required',
        },
      },
      { status: 400 }
    )
  }
  if (!organization_id || typeof organization_id !== 'string') {
    return NextResponse.json(
      {
        error: {
          code:    'BAD_REQUEST',
          message: 'session_id, organization_id, and user_request are required',
        },
      },
      { status: 400 }
    )
  }
  if (!user_request || typeof user_request !== 'string') {
    return NextResponse.json(
      {
        error: {
          code:    'BAD_REQUEST',
          message: 'session_id, organization_id, and user_request are required',
        },
      },
      { status: 400 }
    )
  }

  // ── 2. Log incoming request ───────────────────────────────────────────────
  console.log('[/api/workflows/deploy] incoming request', {
    session_id,
    organization_id,
    user_request_length: user_request.length,
    has_history: Array.isArray(conversation_history) && conversation_history.length > 0,
    workflow_name: workflow_name ?? null,
  })

  // ── 3. Proxy to VPS Bridge ────────────────────────────────────────────────
  const targetUrl = `${VPS_BRIDGE_URL}${UPSTREAM_PATH}`

  const upstreamBody: Record<string, unknown> = {
    session_id,
    organization_id,
    user_request,
  }
  if (Array.isArray(conversation_history)) {
    upstreamBody.conversation_history = conversation_history
  }
  if (workflow_name && typeof workflow_name === 'string') {
    upstreamBody.workflow_name = workflow_name
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  let bridgeResponse: Response
  try {
    bridgeResponse = await fetch(targetUrl, {
      method:  'POST',
      headers,
      body:    JSON.stringify(upstreamBody),
      signal:  AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    const details   = err instanceof Error ? err.message : String(err)

    console.error('[/api/workflows/deploy] network error', { details })

    return NextResponse.json(
      {
        error: {
          code:    'GATEWAY_ERROR',
          message: isTimeout
            ? 'Workflow gateway timed out'
            : 'Failed to contact workflow gateway',
          details,
        },
      },
      { status: 502 }
    )
  }

  // ── 4. Log upstream status ────────────────────────────────────────────────
  console.log('[/api/workflows/deploy] upstream status', {
    status: bridgeResponse.status,
    url:    targetUrl,
  })

  // ── 5. Parse upstream response ────────────────────────────────────────────
  const rawText = await bridgeResponse.text()
  let parsed: unknown = null
  try {
    parsed = rawText ? JSON.parse(rawText) : null
  } catch {
    parsed = null
  }

  // ── 6. Forward error from VPS Bridge ─────────────────────────────────────
  if (!bridgeResponse.ok) {
    // If VPS Bridge returned a structured error, forward it as-is
    if (
      parsed &&
      typeof parsed === 'object' &&
      'error' in (parsed as Record<string, unknown>)
    ) {
      return NextResponse.json(parsed, { status: bridgeResponse.status })
    }

    // Otherwise wrap in our standard UPSTREAM_ERROR shape
    const message =
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).message === 'string'
        ? (parsed as Record<string, unknown>).message as string
        : rawText || `VPS Bridge returned ${bridgeResponse.status}`

    return NextResponse.json(
      {
        error: {
          code:    'UPSTREAM_ERROR',
          message,
          details: {
            status: bridgeResponse.status,
            body:   parsed ?? rawText,
          },
        },
      },
      { status: bridgeResponse.status }
    )
  }

  // ── 7. Return success ─────────────────────────────────────────────────────
  // VPS Bridge should return { draftId, buildStatus, steps }
  return NextResponse.json(parsed ?? {}, { status: 200 })
}
