import { NextRequest, NextResponse } from 'next/server'
import { workflowRepository } from '@/lib/workflows/repository'
import { AivoryWorkflowSpec } from '@/types/workflow'

// PATCH /api/workflows/[id] — partial update
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json() as Partial<AivoryWorkflowSpec>

    const updated = workflowRepository.update(id, body)
    if (!updated) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[PATCH /api/workflows/:id]', err)
    return NextResponse.json({ error: 'Failed to update workflow' }, { status: 500 })
  }
}

// DELETE /api/workflows/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const removed = workflowRepository.remove(id)
    if (!removed) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[DELETE /api/workflows/:id]', err)
    return NextResponse.json({ error: 'Failed to delete workflow' }, { status: 500 })
  }
}
