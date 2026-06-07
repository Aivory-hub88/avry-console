/**
 * POST /api/workflows/copilot-apply
 * Deploy a tested draft to n8n production
 */

import { n8nAsCode } from '@/lib/workflows/n8nAsCodeClient'

export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const { draft_id, activate = true } = await req.json()

    if (!draft_id) {
      return Response.json(
        { error: true, message: 'draft_id is required' },
        { status: 400 }
      )
    }

    console.log(`[copilot-apply] Deploying draft ${draft_id}`)

    const result = await n8nAsCode.deploy(draft_id, activate)

    return Response.json({
      success:     true,
      workflowId:  result.workflowId,
      activated:   result.activated,
      workflowUrl: result.workflowUrl,
      summary:     result.summary,
    })
  } catch (err: any) {
    console.error('[copilot-apply] error:', err)
    return Response.json(
      { error: true, message: err.message },
      { status: 500 }
    )
  }
}
