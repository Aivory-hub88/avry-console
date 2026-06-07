import { NextRequest, NextResponse } from 'next/server'
import { SERVICES } from '@/config/services'
import {
  AiraWorkflowEditRequest,
  AiraWorkflowEditResponse,
  AiraErrorResponse,
  AiraChange,
} from '@/types/aira'

export const maxDuration = 120

/**
 * POST /api/workflows/aira-edit
 * 
 * Aivory Workflow Edit Endpoint
 * Processes AI-powered workflow edits via Zeroclaw gateway with two modes:
 * - EDIT_WORKFLOW: Modify entire workflow structure (10-15s timeout)
 * - EDIT_STEP: Modify single step (2-5s timeout)
 * 
 * Uses Zeroclaw hint: "workflow_edit" for routing to correct model
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let editSessionId = ''
  let mode: string = 'unknown'
  let workflowId: string = 'unknown'

  try {
    // Parse request
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        {
          status: 'error',
          errorCode: 'INVALID_REQUEST',
          errorMessage: 'Invalid JSON body',
        } as AiraErrorResponse,
        { status: 400 }
      )
    }

    const req = body as Record<string, unknown>

    // Validate required fields
    if (!req.mode || typeof req.mode !== 'string') {
      return NextResponse.json(
        {
          status: 'error',
          errorCode: 'INVALID_REQUEST',
          errorMessage: 'mode is required and must be "EDIT_WORKFLOW" or "EDIT_STEP"',
        } as AiraErrorResponse,
        { status: 400 }
      )
    }

    mode = req.mode as string
    if (mode !== 'EDIT_WORKFLOW' && mode !== 'EDIT_STEP') {
      return NextResponse.json(
        {
          status: 'error',
          errorCode: 'INVALID_REQUEST',
          errorMessage: 'mode must be "EDIT_WORKFLOW" or "EDIT_STEP"',
        } as AiraErrorResponse,
        { status: 400 }
      )
    }

    if (!req.instruction || typeof req.instruction !== 'string' || req.instruction.trim() === '') {
      return NextResponse.json(
        {
          status: 'error',
          errorCode: 'INVALID_REQUEST',
          errorMessage: 'instruction is required and must be a non-empty string',
        } as AiraErrorResponse,
        { status: 400 }
      )
    }

    if (!req.workflow || typeof req.workflow !== 'object') {
      return NextResponse.json(
        {
          status: 'error',
          errorCode: 'INVALID_REQUEST',
          errorMessage: 'workflow is required and must be an object',
        } as AiraErrorResponse,
        { status: 400 }
      )
    }

    // For EDIT_STEP mode, targetStepId is required
    if (mode === 'EDIT_STEP' && !req.targetStepId) {
      return NextResponse.json(
        {
          status: 'error',
          errorCode: 'INVALID_REQUEST',
          errorMessage: 'targetStepId is required for EDIT_STEP mode',
        } as AiraErrorResponse,
        { status: 400 }
      )
    }

    const airaReq = req as unknown as AiraWorkflowEditRequest
    editSessionId = airaReq.editSessionId || `session-${Date.now()}`
    workflowId = (airaReq.workflow as any).workflow_id || 'unknown'

    // Set timeout based on mode
    const timeoutMs = mode === 'EDIT_WORKFLOW' ? 15_000 : 5_000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      // Build system prompt
      const systemPrompt = buildSystemPrompt(mode, airaReq)

      // Build user prompt
      const userPrompt = buildUserPrompt(mode, airaReq)

      // Call Zeroclaw with workflow_edit hint
      const llmResponse = await callZeroclaw(
        systemPrompt,
        userPrompt,
        'workflow_edit',
        controller.signal
      )

      // Parse LLM response into changes
      const changes = parseLLMResponse(llmResponse, airaReq)

      // Apply changes to workflow
      const updatedWorkflow = applyChanges(airaReq.workflow as any, changes)

      // Log success
      const latency = Date.now() - startTime
      console.log('[aira-edit] Success', {
        mode,
        workflow_id: workflowId,
        editSessionId,
        changeCount: changes.length,
        latency,
      })

      return NextResponse.json({
        status: 'ok',
        changes,
        updatedWorkflow,
        summary: generateSummary(changes),
      } as AiraWorkflowEditResponse)
    } catch (fetchError: unknown) {
      // Handle timeout
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        const latency = Date.now() - startTime
        console.error('[aira-edit] Timeout', {
          mode,
          workflow_id: workflowId,
          editSessionId,
          latency,
        })

        return NextResponse.json(
          {
            status: 'error',
            errorCode: 'TIMEOUT',
            errorMessage: 'The AI took too long to respond. Try a more specific instruction.',
          } as AiraErrorResponse,
          { status: 504 }
        )
      }

      // Handle network errors
      if (fetchError instanceof TypeError) {
        console.error('[aira-edit] Network error', {
          mode,
          workflow_id: workflowId,
          editSessionId,
          error: fetchError.message,
        })

        return NextResponse.json(
          {
            status: 'error',
            errorCode: 'LLM_ERROR',
            errorMessage: 'Failed to connect to AI service. Please try again.',
          } as AiraErrorResponse,
          { status: 503 }
        )
      }

      throw fetchError
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (error) {
    const latency = Date.now() - startTime
    console.error('[aira-edit] Unexpected error', {
      mode,
      workflow_id: workflowId,
      editSessionId,
      latency,
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      {
        status: 'error',
        errorCode: 'LLM_ERROR',
        errorMessage: 'An unexpected error occurred during workflow editing.',
      } as AiraErrorResponse,
      { status: 500 }
    )
  }
}

/**
 * Build system prompt that defines workflow structure and valid operations
 */
function buildSystemPrompt(mode: string, req: AiraWorkflowEditRequest): string {
  return `You are a workflow configuration assistant for Aivory platform. Your job is to propose precise, minimal edits to a workflow based on user instructions.

Rules:
- Return ONLY valid JSON matching the response schema. No text outside JSON.
- Only use these step types: TRIGGER, ACTION, AI, CONDITION, NOTIFICATION.
- Do NOT rename or add fields outside the existing WorkflowStep schema.
- Prefer minimal changes. Do not restructure unless explicitly asked.
- summary[] must contain 1-5 short plain English sentences describing what changed.
- If you cannot fulfill the request, return status: "error" with errorCode: "UNSUPPORTED" and a friendly errorMessage.

Response schema:
{
  "status": "ok" | "error",
  "changes": [
    {
      "op": "ADD_STEP" | "REMOVE_STEP" | "UPDATE_STEP" | "MOVE_STEP",
      "stepId": "string (for REMOVE_STEP, UPDATE_STEP, MOVE_STEP)",
      "afterStepId": "string (for ADD_STEP, MOVE_STEP)",
      "step": { "step": number, "action": string, "tool": string, "output": string },
      "fields": { "action": string, "tool": string, "output": string }
    }
  ],
  "summary": ["string"],
  "errorCode": "string (if status is error)",
  "errorMessage": "string (if status is error)"
}`
}

/**
 * Build user prompt with mode explanation and instruction
 */
function buildUserPrompt(mode: string, req: AiraWorkflowEditRequest): string {
  const workflow = req.workflow as any
  const modeLabel = mode === 'EDIT_WORKFLOW' ? 'EDIT_WORKFLOW' : `EDIT_STEP (Target step ID: ${req.targetStepId})`
  
  const stepsContext = workflow.steps
    ?.map(
      (s: any) =>
        `Step ${s.step}: ${s.action} (${s.tool}) → ${s.output}`
    )
    .join('\n')

  return `Mode: ${modeLabel}

Current workflow (JSON):
${JSON.stringify(workflow, null, 2)}

User instruction: ${req.instruction}

Return the updated workflow and list of changes as JSON.`
}

/**
 * Call Zeroclaw gateway with workflow_edit hint
 */
async function callZeroclaw(
  systemPrompt: string,
  userPrompt: string,
  hint: string,
  signal: AbortSignal
): Promise<string> {
  const response = await fetch(`${SERVICES.ZEROCLAW}/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: userPrompt,
      history: [
        {
          role: 'system',
          content: systemPrompt,
        },
      ],
      mode: 'workflow_edit',
      hint: hint,
    }),
    signal,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      `Zeroclaw request failed: ${response.status} ${JSON.stringify(errorData)}`
    )
  }

  const data = await response.json()
  return data.message || data.content || ''
}

/**
 * Parse LLM response into structured changes
 */
function parseLLMResponse(
  llmResponse: string,
  req: AiraWorkflowEditRequest
): AiraChange[] {
  try {
    // Strip markdown code fences if present
    let jsonStr = llmResponse
    if (jsonStr.includes('```')) {
      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (match) {
        jsonStr = match[1]
      }
    }

    // Extract JSON from response (in case LLM includes extra text)
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn('[aira-edit] No JSON found in LLM response:', llmResponse)
      return []
    }

    const parsed = JSON.parse(jsonMatch[0])
    const changes = parsed.changes || []

    // Validate and normalize changes
    return changes.filter((change: any) => {
      if (!change.op || !['ADD_STEP', 'REMOVE_STEP', 'UPDATE_STEP', 'MOVE_STEP'].includes(change.op)) {
        console.warn('[aira-edit] Invalid operation:', change.op)
        return false
      }
      return true
    })
  } catch (error) {
    console.error('[aira-edit] Failed to parse LLM response:', error, llmResponse)
    return []
  }
}

/**
 * Apply changes to workflow
 */
function applyChanges(workflow: any, changes: AiraChange[]): any {
  let steps = [...(workflow.steps || [])]

  for (const change of changes) {
    switch (change.op) {
      case 'ADD_STEP': {
        if (!change.step) break
        const afterIdx = change.afterStepId
          ? steps.findIndex((s) => s.step === parseInt(change.afterStepId!))
          : steps.length - 1
        const insertIdx = afterIdx >= 0 ? afterIdx + 1 : steps.length
        steps.splice(insertIdx, 0, change.step)
        // Renumber steps
        steps = steps.map((s, i) => ({ ...s, step: i + 1 }))
        break
      }

      case 'REMOVE_STEP': {
        if (!change.stepId) break
        const stepNum = parseInt(change.stepId)
        steps = steps.filter((s) => s.step !== stepNum)
        // Renumber steps
        steps = steps.map((s, i) => ({ ...s, step: i + 1 }))
        break
      }

      case 'UPDATE_STEP': {
        if (!change.stepId || !change.fields) break
        const stepNum = parseInt(change.stepId)
        steps = steps.map((s) =>
          s.step === stepNum ? { ...s, ...change.fields } : s
        )
        break
      }

      case 'MOVE_STEP': {
        if (!change.stepId || !change.afterStepId) break
        const stepNum = parseInt(change.stepId)
        const afterNum = parseInt(change.afterStepId)
        const step = steps.find((s) => s.step === stepNum)
        if (!step) break
        steps = steps.filter((s) => s.step !== stepNum)
        const afterIdx = steps.findIndex((s) => s.step === afterNum)
        const insertIdx = afterIdx >= 0 ? afterIdx + 1 : steps.length
        steps.splice(insertIdx, 0, step)
        // Renumber steps
        steps = steps.map((s, i) => ({ ...s, step: i + 1 }))
        break
      }
    }
  }

  return {
    ...workflow,
    steps,
  }
}

/**
 * Generate human-readable summary of changes
 */
function generateSummary(changes: AiraChange[]): string[] {
  return changes.map((change) => {
    switch (change.op) {
      case 'ADD_STEP':
        return `Added step: ${change.step?.action || 'New step'}`
      case 'REMOVE_STEP':
        return `Removed step ${change.stepId}`
      case 'UPDATE_STEP':
        return `Updated step ${change.stepId}`
      case 'MOVE_STEP':
        return `Moved step ${change.stepId} after step ${change.afterStepId}`
      default:
        return 'Unknown change'
    }
  })
}
