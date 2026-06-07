import { NextRequest } from 'next/server'
import { getConfig } from '@/lib/config'
import { AivoryWorkflowSpec, WorkflowStep } from '@/types/workflows'

export const maxDuration = 120

const EXPLAIN_SYSTEM_PROMPT = `You are explaining an automation workflow. You receive the path of steps from trigger to a target step. Explain what happens step by step, and how data flows between them. Be concise and business-friendly.

Respond ONLY with strict JSON matching this schema — no markdown, no code fences, no commentary:
{
  "summary": "High-level explanation of what this workflow path does...",
  "steps": [
    { "stepId": "trigger_1", "explanation": "What this step does..." },
    { "stepId": "step_2", "explanation": "What this step does..." }
  ]
}`

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

function computePathToStep(
  workflow: AivoryWorkflowSpec,
  targetStepId: string
): WorkflowStep[] {
  const targetStep = workflow.steps.find((s) => s.id === targetStepId)
  if (!targetStep) return []

  const path: WorkflowStep[] = []
  const visited = new Set<string>()

  function dfs(stepId: string) {
    if (visited.has(stepId)) return
    visited.add(stepId)

    const step = workflow.steps.find((s) => s.id === stepId)
    if (step) path.push(step)
  }

  dfs(targetStepId)
  return path
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workflow, targetStepId } = body

    if (!workflow || typeof workflow !== 'object') {
      return Response.json(
        { error: 'Workflow is required', details: { field: 'workflow' } },
        { status: 400 }
      )
    }

    if (!targetStepId || typeof targetStepId !== 'string') {
      return Response.json(
        { error: 'Target step ID is required', details: { field: 'targetStepId' } },
        { status: 400 }
      )
    }

    const targetStep = workflow.steps.find((s: WorkflowStep) => s.id === targetStepId)
    if (!targetStep) {
      return Response.json(
        { error: 'Target step not found in workflow', details: { field: 'targetStepId' } },
        { status: 400 }
      )
    }

    const pathSteps = computePathToStep(workflow, targetStepId)

    let config: ReturnType<typeof getConfig>
    try {
      config = getConfig()
    } catch (e) {
      console.error('[aira-explain-path] Config error:', e)
      return Response.json(
        { error: 'Server misconfiguration', details: { reason: 'Missing environment variables' } },
        { status: 500 }
      )
    }

    const bridgeUrl = `${config.VPS_BRIDGE_URL}/bridge/aira`
    console.log('[aira-explain-path] Calling bridge:', bridgeUrl)

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
          message: `${EXPLAIN_SYSTEM_PROMPT}\n\nWorkflow path to explain:\n${JSON.stringify(pathSteps, null, 2)}`,
          context: { source: 'workflow_explain_path', page: 'workflows' },
        }),
        signal: controller.signal,
      })
    } catch (fetchErr) {
      clearTimeout(timeoutId)
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        return Response.json(
          { error: 'Request took too long', details: { reason: 'Please try again' } },
          { status: 504 }
        )
      }
      console.error('[aira-explain-path] Bridge unreachable:', fetchErr)
      return Response.json(
        { error: 'Could not reach AI bridge', details: { reason: 'Is the VPS bridge running?' } },
        { status: 502 }
      )
    } finally {
      clearTimeout(timeoutId)
    }

    if (!bridgeResponse.ok) {
      const rawErr = await bridgeResponse.text()
      console.error('[aira-explain-path] Bridge error:', rawErr.slice(0, 500))
      return Response.json(
        { error: 'Unable to explain workflow path', details: { reason: 'Please try again' } },
        { status: bridgeResponse.status }
      )
    }

    const rawBody = await bridgeResponse.text()
    let bridgeData: { raw_agent_response?: string }
    try {
      bridgeData = JSON.parse(rawBody)
    } catch {
      console.error('[aira-explain-path] Bridge returned non-JSON')
      return Response.json(
        { error: 'Bridge returned unexpected response format', details: { reason: 'Please try again' } },
        { status: 502 }
      )
    }

    const rawText = bridgeData.raw_agent_response ?? ''
    if (!rawText.trim()) {
      return Response.json(
        { error: 'AI returned empty response', details: { reason: 'Please try again' } },
        { status: 500 }
      )
    }

    const cleaned = extractJsonObject(rawText)
    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('[aira-explain-path] Failed to parse AI response')
      return Response.json(
        { error: 'AI did not return a valid response', details: { reason: 'Please try again' } },
        { status: 500 }
      )
    }

    if (!parsed.summary || typeof parsed.summary !== 'string') {
      return Response.json(
        { error: 'Invalid response format', details: { reason: 'Missing summary' } },
        { status: 500 }
      )
    }

    if (!Array.isArray(parsed.steps)) {
      return Response.json(
        { error: 'Invalid response format', details: { reason: 'Missing steps array' } },
        { status: 500 }
      )
    }

    return Response.json({
      summary: parsed.summary,
      steps: parsed.steps,
    })
  } catch (error) {
    console.error('[aira-explain-path] error:', error)
    return Response.json(
      { error: 'Internal error', details: { reason: 'Please try again' } },
      { status: 500 }
    )
  }
}
