import { NextRequest, NextResponse } from 'next/server'
import { getConfig } from '@/lib/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const organization_id = body.organization_id ?? 'test-org'
    const user_id = body.user_id ?? body.userId ?? 'console-user'
    const session_id = body.session_id ?? body.sessionId ?? 'console-session'

    const messages =
      Array.isArray(body.messages) && body.messages.length > 0
        ? body.messages
        : body.message
          ? [{ role: 'user', content: String(body.message) }]
          : []

    if (!messages.length) {
      return NextResponse.json(
        { error: true, message: 'Missing messages' },
        { status: 400 }
      )
    }

    const config = getConfig()
    // FIXED: Use /console/stream on VPS Bridge (thin proxy) which forwards to Zeroclaw /webhook
    // Previous code used /bridge/aira which doesn't exist in thin-proxy server.js
    const bridgeUrl = `${config.VPS_BRIDGE_URL}/console/stream`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 115000)

    let bridgeResponse: Response
    try {
      const bridgePayload = {
        message: messages.filter((m: { role: string }) => m.role === 'user').at(-1)?.content ?? '',
        history: messages,
        mode: 'console',
        channel: 'console_ui',
        entrypoint: 'console',
        context: {
          session_id,
          organization_id,
          user_id,
          page: 'console',
          source_tab: 'console',
        },
      }

      bridgeResponse = await fetch(bridgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bridgePayload),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!bridgeResponse.ok) {
      let msg = 'Bridge error'
      try { const e = await bridgeResponse.json(); msg = e.message || e.detail || msg } catch { /* ignore */ }
      return NextResponse.json({ error: true, message: msg }, { status: bridgeResponse.status })
    }

    // Zero-copy passthrough: forward the bridge SSE body directly instead of
    // decode→re-encode per chunk (removes one hop of per-token overhead)
    return new NextResponse(bridgeResponse.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error: any) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: true, message: 'Request timed out' }, { status: 504 })
    }
    console.error('[console/stream] error:', error)
    return NextResponse.json(
      {
        error: 'VPSBridgeError',
        message: error?.message || 'Internal error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
