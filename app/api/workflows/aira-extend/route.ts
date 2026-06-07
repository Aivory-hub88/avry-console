import { NextRequest } from 'next/server'
import { getConfig } from '@/lib/config'
import {
  AivoryWorkflowSpec,
  AivoryWorkflowEdge,
  WorkflowStep,
} from '@/types/workflows'
import {
  ValidationError,
} from '@/lib/workflowValidation'

export const maxDuration = 120

// ── System prompt for workflow extension ────────────────────────────────────

const EXTENSION_SYSTEM_PROMPT = `You are Aivory, the automation and AI copilot inside Aivory.
Your job is to extend existing workflows by adding follow-up steps after a specific node.

You are in WORKFLOW EXTENSION mode.
Respond ONLY with strict JSON matching this schema — no markdown, no code fences, no commentary:
{
  "newSteps": [
    {
      "id": "step_x_1",
      "type": "action",
      "appId": "app_name",
      "actionId": "action_name",
      "connectionId": "conn_id",
      "inputs": {},
      "position": { "x": 400, "y": 480 }
    }
  ],
  "newEdges": [
    { "from": "source_step_id", "to": "step_x_1" }
  ],
  "summary": "Added a Slack notification step after the source step"
}

Rules:
- Generate 1–3 follow-up steps based on the instruction.
- Use "action" for data processing, API calls, AI analysis.
- Use "ai" for AI-powered steps.
- Use "filter" for branching logic, validation.
- Each step MUST have: id, type, appId, actionId, connectionId, inputs, position.
- Position: start at sourceStep.position.y + 180, then y += 180 for each new step.
- Keep step IDs simple (step_x_1, step_x_2, etc).
- Create edges from sourceStepId to the first new step, then chain them.
- Return 1–3 steps total.
- Output ONLY the JSON object. Nothing else.`

// ── JSON extraction helper ────────────────────────────────────────────────────

function extractJsonObject(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) {
    const candidate = fenceMatch[1].trim()
    if (candidate.startsWith('{')) return candidate
  }
  const start = text.indexOf('{')
  if (start === -1) return text.trim()
  let depth = 0
  let end = -1
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end !== -1) return text.slice(start, end + 1)
  return text.trim()
}

// ── Validation helper ──────────────────────────────────────────────────────────

function validateExtensionResult(
  workflow: AivoryWorkflowSpec,
  newSteps: WorkflowStep[],
  newEdges: AivoryWorkflowEdge[],
  sourceStepId: string,
  availableAppIds: string[],
  connectionStatus: Record<string, boolean>
): ValidationError | null {
  // Validate source step exists
  const sourceStep = workflow.steps.find((s) => s.id === sourceStepId)
  if (!sourceStep) {
    return {
      field: 'sourceStepId',
      reason: `Source step "${sourceStepId}" not found in workflow`,
    }
  }

  // Validate new steps have unique IDs
  const allStepIds = new Set(workflow.steps.map((s) => s.id))
  for (const step of newSteps) {
    if (allStepIds.has(step.id)) {
      return {
        field: 'newSteps',
        reason: `Step ID "${step.id}" already exists in workflow`,
      }
    }
    allStepIds.add(step.id)
  }

  // Validate new steps have required fields
  for (let i = 0; i < newSteps.length; i++) {
    const step = newSteps[i]
    const requiredFields = ['id', 'type', 'appId', 'actionId', 'connectionId', 'inputs', 'position']
    for (const field of requiredFields) {
      if (!(field in step)) {
        return {
          field: `newSteps[${i}]`,
          reason: `Missing required field: ${field}`,
        }
      }
    }
  }

  // Validate app connections
  for (const step of newSteps) {
    if (!availableAppIds.includes(step.appId)) {
      return {
        field: 'newSteps',
        reason: `App "${step.appId}" not available`,
      }
    }
  }

  // Validate connection status
  for (const step of newSteps) {
    if (!connectionStatus[step.connectionId]) {
      return {
        field: 'newSteps',
        reason: `Connection "${step.connectionId}" is not active`,
      }
    }
  }

  // Validate edges reference valid steps
  const validStepIds = new Set([...allStepIds, sourceStepId])
  for (const edge of newEdges) {
    if (!validStepIds.has(edge.from)) {
      return {
        field: 'newEdges',
        reason: `Edge references invalid source step: "${edge.from}"`,
      }
    }
    if (!validStepIds.has(edge.to)) {
      return {
        field: 'newEdges',
        reason: `Edge references invalid target step: "${edge.to}"`,
      }
    }
  }

  return null
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { mode, workflow, sourceStepId, instruction } = body

    // Validate request
    if (mode !== 'EXTEND_AFTER_STEP') {
      return Response.json(
        {
          error: 'Invalid mode',
          details: { field: 'mode', reason: 'Must be EXTEND_AFTER_STEP' },
        },
        { status: 400 }
      )
    }

    if (!workflow || typeof workflow !== 'object') {
      return Response.json(
        {
          error: 'Workflow is required',
          details: { field: 'workflow', reason: 'Must be a valid workflow object' },
        },
        { status: 400 }
      )
    }

    if (!sourceStepId || typeof sourceStepId !== 'string') {
      return Response.json(
        {
          error: 'Source step ID is required',
          details: { field: 'sourceStepId', reason: 'Must be a valid step ID' },
        },
        { status: 400 }
      )
    }

    if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
      return Response.json(
        {
          error: 'Instruction is required',
          details: { field: 'instruction', reason: 'Please provide an instruction' },
        },
        { status: 400 }
      )
    }

    let config: ReturnType<typeof getConfig>
    try {
      config = getConfig()
    } catch (e) {
      console.error('[aira-extend] Config error:', e)
      return Response.json(
        {
          error: 'Server misconfiguration',
          details: { reason: 'Missing environment variables' },
        },
        { status: 500 }
      )
    }

    // Build available apps context
    const availableAppIds = workflow.steps
      .map((step: WorkflowStep) => step.appId)
      .filter((id: string, idx: number, arr: string[]) => arr.indexOf(id) === idx)

    const connectionStatus: Record<string, boolean> = {}
    workflow.steps.forEach((step: WorkflowStep) => {
      connectionStatus[step.connectionId] = true
    })

    // Build user message with context
    const sourceStep = workflow.steps.find((s: WorkflowStep) => s.id === sourceStepId)
    let userMessage = instruction.trim()
    if (sourceStep) {
      userMessage = `After step "${sourceStep.appId} - ${sourceStep.actionId}":\n${userMessage}`
    }
    userMessage += `\n\nAvailable apps: ${availableAppIds.join(', ')}`

    const bridgeUrl = `${config.VPS_BRIDGE_URL}/bridge/aira`
    console.log('[aira-extend] Calling bridge:', bridgeUrl)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 115000)

    let bridgeResponse: Response
    try {
      bridgeResponse = await fetch(bridgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `${EXTENSION_SYSTEM_PROMPT}\n\n${userMessage}`,
          context: { source: 'workflow_extension', page: 'workflows' },
        }),
        signal: controller.signal,
      })
    } catch (fetchErr) {
      clearTimeout(timeoutId)
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        return Response.json(
          {
            error: 'Extension took too long',
            details: { reason: 'Please try again with a simpler instruction' },
          },
          { status: 504 }
        )
      }
      console.error('[aira-extend] Bridge unreachable:', fetchErr)
      return Response.json(
        {
          error: 'Could not reach AI bridge',
          details: { reason: 'Is the VPS bridge running?' },
        },
        { status: 502 }
      )
    } finally {
      clearTimeout(timeoutId)
    }

    if (!bridgeResponse.ok) {
      const rawErr = await bridgeResponse.text()
      console.error('[aira-extend] Bridge error body:', rawErr.slice(0, 500))
      return Response.json(
        {
          error: 'Unable to extend workflow',
          details: { reason: 'Please try again' },
        },
        { status: bridgeResponse.status }
      )
    }

    const rawBody = await bridgeResponse.text()
    console.log('[aira-extend] Bridge raw body (first 500):', rawBody.slice(0, 500))

    let bridgeData: { raw_agent_response?: string }
    try {
      bridgeData = JSON.parse(rawBody)
    } catch {
      console.error('[aira-extend] Bridge returned non-JSON body')
      return Response.json(
        {
          error: 'Bridge returned unexpected response format',
          details: { reason: 'Please try again' },
        },
        { status: 502 }
      )
    }

    const rawText = bridgeData.raw_agent_response ?? ''
    if (!rawText.trim()) {
      console.error('[aira-extend] raw_agent_response is empty')
      return Response.json(
        {
          error: 'AI returned empty response',
          details: { reason: 'Please try again' },
        },
        { status: 500 }
      )
    }

    // Parse JSON response
    const cleaned = extractJsonObject(rawText)
    console.log('[aira-extend] Extracted JSON (first 300):', cleaned.slice(0, 300))

    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('[aira-extend] Failed to parse AI response as JSON:', rawText.slice(0, 500))
      return Response.json(
        {
          error: 'AI did not return a valid response',
          details: { reason: 'Try rephrasing your instruction' },
        },
        { status: 500 }
      )
    }

    // Validate parsed response structure
    if (!Array.isArray(parsed.newSteps) || parsed.newSteps.length === 0) {
      return Response.json(
        {
          error: 'AI returned no new steps',
          details: { reason: 'Try being more specific' },
        },
        { status: 500 }
      )
    }

    if (!Array.isArray(parsed.newEdges)) {
      return Response.json(
        {
          error: 'AI returned invalid edges',
          details: { reason: 'Try rephrasing your instruction' },
        },
        { status: 500 }
      )
    }

    if (!parsed.summary || typeof parsed.summary !== 'string') {
      return Response.json(
        {
          error: 'AI returned invalid summary',
          details: { reason: 'Try rephrasing your instruction' },
        },
        { status: 500 }
      )
    }

    // Validate extension result
    const validationError = validateExtensionResult(
      workflow,
      parsed.newSteps as WorkflowStep[],
      parsed.newEdges as AivoryWorkflowEdge[],
      sourceStepId,
      availableAppIds,
      connectionStatus
    )

    if (validationError) {
      console.log('[aira-extend] Validation error:', validationError)
      return Response.json(
        {
          error: validationError.reason,
          details: { field: validationError.field },
        },
        { status: 400 }
      )
    }

    // Success response
    const result = {
      newSteps: parsed.newSteps as WorkflowStep[],
      newEdges: parsed.newEdges as AivoryWorkflowEdge[],
      summary: parsed.summary as string,
    }

    console.log('[aira-extend] Extension successful:', {
      sourceStepId,
      stepCount: result.newSteps.length,
      edgeCount: result.newEdges.length,
    })

    return Response.json(result)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return Response.json(
        {
          error: 'Extension took too long',
          details: { reason: 'Please try again with a simpler instruction' },
        },
        { status: 504 }
      )
    }
    console.error('[aira-extend] error:', error)
    return Response.json(
      {
        error: 'Internal error',
        details: { reason: 'Please try again' },
      },
      { status: 500 }
    )
  }
}
