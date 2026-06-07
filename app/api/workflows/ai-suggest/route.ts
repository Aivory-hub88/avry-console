/**
 * POST /api/workflows/ai-suggest
 * 
 * Generates workflow specifications from natural language descriptions using LLM.
 * 
 * Request body:
 * {
 *   intent: string                    // User's workflow description
 *   availableApps?: App[]             // List of connected apps (optional)
 *   useConnections?: boolean          // Only suggest connected apps (default: true)
 * }
 * 
 * Response (Success):
 * {
 *   spec: AivoryWorkflowSpec
 *   edges: AivoryWorkflowEdge[]
 *   notes: {
 *     summary: string
 *     assumptions: string[]
 *     warnings: string[]
 *   }
 * }
 * 
 * Response (Error):
 * {
 *   error: string
 *   details?: {
 *     field?: string
 *     reason?: string
 *   }
 * }
 */

import { NextRequest } from 'next/server'
import { getConfig } from '@/lib/config'
import {
  AivoryWorkflowSpec,
  AivoryWorkflowEdge,
  WorkflowGenerationResult,
  WorkflowStep,
} from '@/types/workflows'
import {
  validateTriggerExists,
  validateAppConnections,
  validateConnectionStatus,
  detectCycles,
  ValidationError,
} from '@/lib/workflowValidation'

export const maxDuration = 120

// ── System prompt for workflow generation ──────────────────────────────────────

const GENERATION_SYSTEM_PROMPT = `You are Aivory, the automation and AI copilot inside Aivory.
Your job is to generate structured workflow specs that Aivory can deploy to n8n.

You are in WORKFLOW GENERATION mode.
Respond ONLY with strict JSON matching this schema — no markdown, no code fences, no commentary:
{
  "name": "Workflow Title",
  "description": "What this workflow does",
  "steps": [
    {
      "id": "step_1",
      "type": "trigger",
      "appId": "app_name",
      "actionId": "action_name",
      "connectionId": "conn_id",
      "inputs": {},
      "position": { "x": 400, "y": 300 }
    },
    {
      "id": "step_2",
      "type": "action",
      "appId": "app_name",
      "actionId": "action_name",
      "connectionId": "conn_id",
      "inputs": {},
      "position": { "x": 400, "y": 480 }
    }
  ],
  "edges": [
    { "from": "step_1", "to": "step_2" }
  ]
}

Rules:
- First step MUST be type "trigger".
- Use "action" for data processing, API calls, AI analysis.
- Use "ai" for AI-powered steps.
- Use "filter" for branching logic, validation.
- Each step MUST have: id, type, appId, actionId, connectionId, inputs, position.
- Position: trigger at (400, 300), then y += 180 for each step.
- Keep step IDs simple (step_1, step_2, etc).
- Return 3–8 steps total.
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

function validateGeneratedSpec(
  spec: AivoryWorkflowSpec,
  edges: AivoryWorkflowEdge[],
  availableAppIds: string[],
  connectionStatus: Record<string, boolean>
): ValidationError | null {
  // Validate trigger exists
  const triggerError = validateTriggerExists(spec)
  if (triggerError) return triggerError

  // Validate app connections
  const appError = validateAppConnections(spec, availableAppIds)
  if (appError) return appError

  // Validate connection status
  const connectionError = validateConnectionStatus(spec, connectionStatus)
  if (connectionError) return connectionError

  // Detect cycles
  const stepIds = spec.steps.map((step) => step.id)
  const cycleError = detectCycles(edges, stepIds)
  if (cycleError) return cycleError

  return null
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { intent, availableApps = [], useConnections = true } = body

    // Validate request
    if (!intent || typeof intent !== 'string' || !intent.trim()) {
      return Response.json(
        {
          error: 'Intent is required',
          details: { field: 'intent', reason: 'Please provide a workflow description' },
        },
        { status: 400 }
      )
    }

    let config: ReturnType<typeof getConfig>
    try {
      config = getConfig()
    } catch (e) {
      console.error('[ai-suggest] Config error:', e)
      return Response.json(
        {
          error: 'Server misconfiguration',
          details: { reason: 'Missing environment variables' },
        },
        { status: 500 }
      )
    }

    // Build available apps context for LLM
    const availableAppIds = availableApps.map((app: any) => app.id || app.name).filter(Boolean)
    const connectionStatus: Record<string, boolean> = {}
    availableApps.forEach((app: any) => {
      if (app.connections) {
        app.connections.forEach((conn: any) => {
          connectionStatus[conn.id] = conn.active !== false
        })
      }
    })

    // Build user message with context
    let userMessage = intent.trim()
    if (useConnections && availableAppIds.length > 0) {
      userMessage += `\n\nAvailable apps: ${availableAppIds.join(', ')}`
    }

    const bridgeUrl = `${config.VPS_BRIDGE_URL}/bridge/aira`
    console.log('[ai-suggest] Calling bridge:', bridgeUrl)

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
          message: `${GENERATION_SYSTEM_PROMPT}\n\n${userMessage}`,
          context: { source: 'workflow_generation', page: 'workflows' },
        }),
        signal: controller.signal,
      })
    } catch (fetchErr) {
      clearTimeout(timeoutId)
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        return Response.json(
          {
            error: 'Generation took too long',
            details: { reason: 'Please try again with a simpler description' },
          },
          { status: 504 }
        )
      }
      console.error('[ai-suggest] Bridge unreachable:', fetchErr)
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
      console.error('[ai-suggest] Bridge error body:', rawErr.slice(0, 500))
      let msg = 'Bridge error'
      try {
        const e = JSON.parse(rawErr)
        msg = e.message || e.detail || msg
      } catch {
        /* not JSON */
      }
      return Response.json(
        {
          error: 'Unable to generate workflow',
          details: { reason: 'Please try again' },
        },
        { status: bridgeResponse.status }
      )
    }

    const rawBody = await bridgeResponse.text()
    console.log('[ai-suggest] Bridge raw body (first 500):', rawBody.slice(0, 500))

    let bridgeData: { raw_agent_response?: string }
    try {
      bridgeData = JSON.parse(rawBody)
    } catch {
      console.error('[ai-suggest] Bridge returned non-JSON body')
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
      console.error('[ai-suggest] raw_agent_response is empty')
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
    console.log('[ai-suggest] Extracted JSON (first 300):', cleaned.slice(0, 300))

    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('[ai-suggest] Failed to parse AI response as JSON:', rawText.slice(0, 500))
      return Response.json(
        {
          error: 'AI did not return a valid workflow',
          details: { reason: 'Try rephrasing your request' },
        },
        { status: 500 }
      )
    }

    // Validate parsed response structure
    if (!parsed.name || typeof parsed.name !== 'string') {
      return Response.json(
        {
          error: 'Generated workflow missing name',
          details: { reason: 'Try rephrasing your request' },
        },
        { status: 500 }
      )
    }

    if (!parsed.description || typeof parsed.description !== 'string') {
      return Response.json(
        {
          error: 'Generated workflow missing description',
          details: { reason: 'Try rephrasing your request' },
        },
        { status: 500 }
      )
    }

    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      return Response.json(
        {
          error: 'AI returned no workflow steps',
          details: { reason: 'Try being more specific' },
        },
        { status: 500 }
      )
    }

    // Validate all steps have required fields
    for (let i = 0; i < parsed.steps.length; i++) {
      const step = parsed.steps[i]
      const requiredFields = ['id', 'type', 'appId', 'actionId', 'connectionId', 'inputs', 'position']
      for (const field of requiredFields) {
        if (!(field in step)) {
          return Response.json(
            {
              error: `Step ${i} missing required field: ${field}`,
              details: { reason: 'Try rephrasing your request' },
            },
            { status: 500 }
          )
        }
      }
    }

    // Build spec and edges
    const spec: AivoryWorkflowSpec = {
      name: parsed.name,
      description: parsed.description,
      source: 'workflow-tab',
      intent: intent.trim(),
      steps: parsed.steps as WorkflowStep[],
    }

    const edges: AivoryWorkflowEdge[] = parsed.edges || []

    // Collect app availability and connection status warnings separately instead of throwing error
    const unavailableAppWarnings: string[] = [];
    const inactiveConnectionWarnings: string[] = [];
    
    for (const step of spec.steps) {
      if (!availableAppIds.includes(step.appId)) {
        unavailableAppWarnings.push(`App ${step.appId} is not available. Please connect it first.`);
      }
      
      const isActive = connectionStatus[step.connectionId];
      if (isActive === undefined || !isActive) {
        inactiveConnectionWarnings.push(`Connection ${step.connectionId} is not active. Please reconnect.`);
      }
    }

    // Check for other validation errors (trigger, cycles) but not app availability or connection status
    const otherValidationError = validateGeneratedSpec(
      spec,
      edges,
      [], // Pass empty array to skip app availability validation
      {}  // Pass empty object to skip connection status validation
    )

    if (otherValidationError) {
      console.log('[ai-suggest] Validation error:', otherValidationError)
      return Response.json(
        {
          error: otherValidationError.reason,
          details: { field: otherValidationError.field },
        },
        { status: 400 }
      )
    }
    
    // Combine all warnings
    const allWarnings = [...unavailableAppWarnings, ...inactiveConnectionWarnings];

    // Success response
    const result: WorkflowGenerationResult = {
      spec,
      edges,
      notes: {
        summary: spec.description,
        assumptions: [
          'Workflow assumes all connected apps are available',
          'Steps are positioned sequentially on the canvas',
        ],
        warnings: allWarnings,
      },
    }

    console.log('[ai-suggest] Generation successful:', {
      intent: intent.slice(0, 100),
      stepCount: spec.steps.length,
      edgeCount: edges.length,
    })

    return Response.json(result)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return Response.json(
        {
          error: 'Generation took too long',
          details: { reason: 'Please try again with a simpler description' },
        },
        { status: 504 }
      )
    }
    console.error('[ai-suggest] error:', error)
    return Response.json(
      {
        error: 'Internal error',
        details: { reason: 'Please try again' },
      },
      { status: 500 }
    )
  }
}
