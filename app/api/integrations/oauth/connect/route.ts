/**
 * POST /api/integrations/oauth/connect
 *
 * Initiates a Composio OAuth connection for a given app, scoped to the
 * session-resolved Aivory user. Returns a redirectUrl that the frontend opens
 * in a popup.
 *
 * Authentication & gating: the caller is resolved from the shared
 * cross-subdomain session via `resolveIntegrationUser(req)`. On any auth/gating
 * failure the route returns the structured `Error_Contract` and performs NO
 * Composio work. The Composio `Entity_Id` is the session-resolved `userId` — a
 * client-supplied `userId` in the body is IGNORED, closing the isolation hole
 * where a caller could connect on behalf of any entity.
 *
 * Request body:
 *   { appId: string }    // any `userId` field is ignored
 *
 * Success response (200):
 *   { redirectUrl: string | null, connectionId: string | null }
 *
 * Error response:
 *   { error: { code: string, message: string, details?: string } }
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 6.7, 10.1, 10.5
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getComposioClient,
  getComposioRedirectUrl,
  isComposioConfigError,
} from '@/lib/composio'
import { resolveIntegrationUser } from '@/lib/integration-auth'
import { errorResponse } from '@/lib/integration-errors'

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Gate first: resolve + authorize the caller from the session cookies.
  //    On AuthError, return the contract immediately and do NO Composio work.
  const auth = resolveIntegrationUser(req)
  if (!auth.ok) {
    return errorResponse(auth)
  }

  // 2. Read the body. Any client-supplied `userId` is intentionally ignored —
  //    only `appId` is read and validated.
  let body: { appId?: unknown }
  try {
    body = await req.json()
  } catch {
    return errorResponse({
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Invalid JSON body',
    })
  }

  // 3. Validate `appId`: must be a non-empty string. Reject with 400 and
  //    perform no Composio operation otherwise.
  const appId = body?.appId
  if (typeof appId !== 'string' || appId.trim() === '') {
    return errorResponse({
      status: 400,
      code: 'BAD_REQUEST',
      message: 'appId is required',
    })
  }

  // 4. Initiate the connection on the SESSION-derived entity. Reconnect uses
  //    this same path.
  try {
    const composio    = getComposioClient()
    const entity      = composio.getEntity(auth.userId)
    const redirectUrl = getComposioRedirectUrl()

    const connectionRequest = await entity.initiateConnection({
      appName:     appId,
      redirectUri: redirectUrl,
    })

    console.log('[integrations/oauth/connect] initiated', {
      userId: auth.userId,
      appId,
      redirectUrl: connectionRequest.redirectUrl,
    })

    return NextResponse.json({
      redirectUrl:  connectionRequest.redirectUrl,
      connectionId: connectionRequest.connectedAccountId ?? null,
    })
  } catch (err: unknown) {
    // Composio-not-configured is detected via the stable sentinel predicate —
    // never by substring-matching an env value, and no env value is echoed.
    if (isComposioConfigError(err)) {
      return errorResponse({
        status: 500,
        code: 'COMPOSIO_ERROR',
        message: 'Composio is not configured on this server',
      })
    }

    // `details` is derived from the thrown error message, which can embed the
    // Composio API key — `errorResponse` scrubs configured secrets before
    // serializing, so the secret can never leak (Requirements 7.1, 10.5).
    const details = err instanceof Error ? err.message : String(err)
    console.error('[integrations/oauth/connect] Composio error:', details)
    return errorResponse({
      status: 500,
      code: 'COMPOSIO_ERROR',
      message: 'Failed to initiate OAuth connection',
      details,
    })
  }
}
