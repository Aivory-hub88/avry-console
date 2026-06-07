import { NextRequest, NextResponse } from 'next/server'
import { workflowRepository } from '@/lib/workflows/repository'
import { setN8nWorkflowActive } from '@/lib/workflows/n8nClient'

export const maxDuration = 30

/**
 * POST /api/workflows/[id]/deactivate
 *
 * Deactivates the n8n workflow and sets local status back to 'draft'.
 * Returns 400 if the workflow was never activated (no n8n_workflow_id).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  // 1. Load workflow
  const spec = workflowRepository.get(id)
  if (!spec) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
  }

  if (!spec.n8n_workflow_id) {
    return NextResponse.json(
      { error: 'Workflow has not been activated yet (no n8n_workflow_id)' },
      { status: 400 }
    )
  }

  try {
    // 2. Deactivate in n8n
    await setN8nWorkflowActive(spec.n8n_workflow_id, false)

    // 3. Update local status
    const updated = workflowRepository.update(id, { status: 'draft' })

    console.log('[deactivate] Workflow deactivated', { id, n8nWorkflowId: spec.n8n_workflow_id })

    return NextResponse.json(updated)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[deactivate] Failed', { id, error: message })
    return NextResponse.json(
      { error: `Deactivation failed: ${message}` },
      { status: 502 }
    )
  }
}
