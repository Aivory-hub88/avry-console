/**
 * POST /api/workflows/copilot-test
 *
 * Two modes:
 *   1. Natural language → Zeroclaw decomposes → structured steps → n8nAsCode
 *   2. Legacy: pre-structured steps passed directly → n8nAsCode
 */

import { n8nAsCode } from '@/lib/workflows/n8nAsCodeClient'
import { planWorkflowFromNaturalLanguage } from '@/lib/workflows/zeroclawWorkflowPlanner'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const {
      message,      // natural language input (new)
      steps,        // pre-structured steps (legacy, still supported)
      intent,       // explicit intent override
      session_id,
    } = body

    let plan

    if (message && !steps) {
      // New flow: natural language → Zeroclaw → plan
      console.log(`[copilot-test] Zeroclaw planning from: "${message.slice(0, 80)}"`)
      plan = await planWorkflowFromNaturalLanguage(message)
    } else if (steps) {
      // Legacy flow: pre-structured steps passed directly
      plan = {
        intent: intent || 'Workflow automation',
        steps,
      }
    } else {
      return Response.json(
        { error: true, message: 'Either message or steps is required' },
        { status: 400 }
      )
    }

    console.log(`[copilot-test] Building + testing: "${plan.intent}" (${plan.steps.length} steps)`)

    // Build draft
    const built = await n8nAsCode.build(plan.intent, plan.steps)

    // Run real execution sandbox test
    const tested = await n8nAsCode.test(built.draft_id)

    // Check credential readiness
    const creds = await n8nAsCode.bindCredentials(built.draft_id)

    return Response.json({
      draft_id:      built.draft_id,
      plan,
      testResult:    tested,
      credentials:   creds,
      readyToDeploy: creds.readyToDeploy && tested.status === 'passed',
    })
  } catch (err: any) {
    console.error('[copilot-test] error:', err)
    return Response.json(
      { error: true, message: err.message },
      { status: 500 }
    )
  }
}
