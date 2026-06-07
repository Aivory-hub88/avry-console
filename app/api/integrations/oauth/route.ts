/**
 * OAuth API Route — Composio Integration Sessions
 *
 * GET /api/integrations/oauth?action=session
 *   → Resolves + gates the current user, fetches their Composio connected
 *     accounts (scoped to their entity), and returns a structured session
 *     payload.
 *
 * GET /api/integrations/oauth?action=status
 *   → Returns the list of connected apps (AivoryConnection shape) for the
 *     current user, scoped to their entity.
 *
 * POST /api/integrations/oauth  { action: 'revoke', connectedAccountId }
 *   → Deletes a Composio connected account for the current user.
 *
 * Identity + gating: every handler begins by calling `resolveIntegrationUser`
 * (shared cross-subdomain session cookies → real Aivory `user_id`, paid-tier
 * gate with super-admin bypass). On `AuthError` the route returns the structured
 * `Error_Contract` immediately and performs NO Composio operation. The old
 * `resolveUserId()` `'default'` fallback / header-based identity is removed, so
 * each user's connections are isolated by `Entity_Id = user_id`.
 *
 * Error contract (no raw 500s):
 *   401  { error: { code: 'UNAUTHENTICATED', message: '...' } }
 *   403  { error: { code: 'FORBIDDEN',       message: '...' } }
 *   400  { error: { code: 'BAD_REQUEST',     message: '...' } }
 *   500  { error: { code: 'COMPOSIO_ERROR',  message: '...', details?: '...' } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getComposioClient, isComposioConfigError } from '@/lib/composio'
import { resolveIntegrationUser } from '@/lib/integration-auth'
import { errorResponse } from '@/lib/integration-errors'
import { mapConnectionStatus } from '@/lib/integration-status'
import type { AivoryConnection } from '@/types/integrations'

// ── Composio error → Error_Contract ───────────────────────────────────────────
// Detects the "not configured" sentinel (no env value echoed) and otherwise
// wraps the failure in a sanitized COMPOSIO_ERROR contract.
function composioErrorResponse(err: unknown, fallbackMessage: string): NextResponse {
  if (isComposioConfigError(err)) {
    return errorResponse({
      status: 500,
      code: 'COMPOSIO_ERROR',
      message: 'Composio is not configured on this server',
    })
  }

  const details = err instanceof Error ? err.message : String(err)
  return errorResponse({
    status: 500,
    code: 'COMPOSIO_ERROR',
    message: fallbackMessage,
    details,
  })
}

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const action = req.nextUrl.searchParams.get('action')

  // ── action=session ──────────────────────────────────────────────────────────
  if (action === 'session') {
    // 1. Resolve + gate the caller. On AuthError, return immediately and do NO
    //    Composio work.
    const auth = resolveIntegrationUser(req)
    if (!auth.ok) return errorResponse(auth)

    const userId = auth.userId

    // 2. Fetch connected accounts from Composio, scoped to the user's entity.
    try {
      const composio = getComposioClient()
      const entity = composio.getEntity(userId)
      const connections = await entity.getConnections()

      const connectedApps = Array.isArray(connections)
        ? connections.map((c: Record<string, unknown>) => ({
            appName: c.appName ?? c.appUniqueId ?? null,
            status: mapConnectionStatus({
              status: String(c.status ?? ''),
              enabled: c.enabled as boolean | undefined,
              isDisabled: c.isDisabled as boolean | undefined,
              deleted: c.deleted as boolean | undefined,
            }),
            connectedAt: c.createdAt ?? null,
            accountId: c.id ?? null,
          }))
        : []

      const now = new Date().toISOString()

      return NextResponse.json({
        success: true,
        data: {
          userId,
          composioEntityId: userId,
          connectedApps,
          createdAt: now,
          updatedAt: now,
        },
      })
    } catch (err: unknown) {
      const details = err instanceof Error ? err.message : String(err)
      console.error('[integrations/oauth?action=session] Composio error:', details)
      return composioErrorResponse(err, 'Failed to initialize Composio session')
    }
  }

  // ── action=status ───────────────────────────────────────────────────────────
  if (action === 'status') {
    const auth = resolveIntegrationUser(req)
    if (!auth.ok) return errorResponse(auth)

    const userId = auth.userId

    try {
      const composio = getComposioClient()
      const entity = composio.getEntity(userId)
      const rawConns = await entity.getConnections()
      const connections = Array.isArray(rawConns) ? rawConns : []

      // Map Composio's raw connection objects → AivoryConnection shape, using
      // the shared pure status mapping (single source of truth).
      const mapped: AivoryConnection[] = connections.map((c: Record<string, unknown>) => {
        const status = mapConnectionStatus({
          status: String(c.status ?? ''),
          enabled: c.enabled as boolean | undefined,
          isDisabled: c.isDisabled as boolean | undefined,
          deleted: c.deleted as boolean | undefined,
        })

        // Derive a stable appId: prefer appName/appUniqueId, lowercased, spaces → '-'
        const rawAppName = String(c.appName ?? c.appUniqueId ?? '')
        const appId = rawAppName.toLowerCase().replace(/\s+/g, '-')

        return {
          id: String(c.id ?? c.connectedAccountId ?? ''),
          tenantId: userId,
          appId,
          appName: rawAppName,
          appIcon: '',
          displayName: String(c.displayName ?? rawAppName),
          status,
          authType: 'oauth' as const,
          storageRef: '',
          createdAt: String(c.createdAt ?? new Date().toISOString()),
          updatedAt: String(c.updatedAt ?? new Date().toISOString()),
          lastUsedAt: (c.lastUsedAt as string | null) ?? null,
          accountIdentifier:
            (c.accountIdentifier as string | null) ??
            (c.email as string | null) ??
            (c.username as string | null) ??
            null,
          oauthProvider: appId,
        }
      })

      return NextResponse.json(mapped)
    } catch (err: unknown) {
      const details = err instanceof Error ? err.message : String(err)
      console.error('[integrations/oauth?action=status] Composio error:', details)
      return composioErrorResponse(err, 'Failed to fetch connection status')
    }
  }

  // ── unknown action ──────────────────────────────────────────────────────────
  return errorResponse({
    status: 400,
    code: 'BAD_REQUEST',
    message: 'Unknown action. Use ?action=session or ?action=status',
  })
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Resolve + gate the caller. On AuthError, return immediately and do NO
  //    Composio work.
  const auth = resolveIntegrationUser(req)
  if (!auth.ok) return errorResponse(auth)

  let body: { action?: string; appId?: string; connectedAccountId?: string }
  try {
    body = await req.json()
  } catch {
    return errorResponse({
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Invalid JSON body',
    })
  }

  // ── action=revoke ───────────────────────────────────────────────────────────
  if (body.action === 'revoke') {
    const accountId = body.connectedAccountId
    if (!accountId) {
      return errorResponse({
        status: 400,
        code: 'BAD_REQUEST',
        message: 'connectedAccountId is required for revoke',
      })
    }

    try {
      const composio = getComposioClient()
      await composio.connectedAccounts.delete({ connectedAccountId: accountId })
      return NextResponse.json({ success: true })
    } catch (err: unknown) {
      const details = err instanceof Error ? err.message : String(err)
      console.error('[integrations/oauth POST revoke] Composio error:', details)
      return composioErrorResponse(err, 'Failed to revoke connection')
    }
  }

  return errorResponse({
    status: 400,
    code: 'BAD_REQUEST',
    message: 'Unknown action',
  })
}
