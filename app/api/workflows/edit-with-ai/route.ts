import { NextRequest } from 'next/server'
import { getConfig } from '@/lib/config'
import { createErrorResponse } from '@/types/errors'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workflow_id, current_workflow, user_instruction } = body

    if (!workflow_id || !current_workflow || !user_instruction) {
      return Response.json(
        createErrorResponse('ValidationError', 'Missing required fields: workflow_id, current_workflow, user_instruction'),
        { status: 400 }
      )
    }

    const config = getConfig()

    const prompt = `You are an AI workflow editor. The user wants to modify an automation workflow.

CURRENT WORKFLOW:
${JSON.stringify(current_workflow, null, 2)}

USER INSTRUCTION: "${user_instruction}"

Apply the user's requested change to the workflow. Return ONLY a valid JSON object with the updated workflow fields.
Only include fields that changed. At minimum return the updated "steps" array.
Do not include markdown, code blocks, or commentary.`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55_000)

    let response: Response
    try {
      response = await fetch(`${config.VPS_BRIDGE_URL}/blueprints/generate-workflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workflow_id,
          workflow_title: current_workflow.title,
          workflow_steps: current_workflow.steps,
          diagnostic_context: { user_instruction, current_workflow },
          company_name: current_workflow.company_name
        }),
        signal: controller.signal
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return Response.json(createErrorResponse('TimeoutError', 'AI edit timed out.'), { status: 504 })
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return Response.json(
        createErrorResponse(errorData.error || 'ServiceError', errorData.message || 'AI edit failed'),
        { status: response.status }
      )
    }

    const data = await response.json()
    return Response.json(data)

  } catch (error) {
    console.error('Workflow AI edit error:', error)
    return Response.json(
      createErrorResponse('InternalError', 'An unexpected error occurred'),
      { status: 500 }
    )
  }
}
