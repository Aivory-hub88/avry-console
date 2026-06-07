import { NextRequest, NextResponse } from 'next/server'
import { canvasRepository } from '@/lib/workflows/canvasRepository'

// GET /api/workflows/[id]/canvas — load canvas state
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const state = canvasRepository.get(params.id)
  if (!state) return NextResponse.json(null)
  return NextResponse.json(state)
}

// PUT /api/workflows/[id]/canvas — save canvas state
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { nodes, edges } = await req.json()
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      return NextResponse.json({ error: 'nodes and edges must be arrays' }, { status: 400 })
    }
    const saved = canvasRepository.set(params.id, nodes, edges)
    return NextResponse.json(saved)
  } catch (err) {
    console.error('[PUT /api/workflows/[id]/canvas]', err)
    return NextResponse.json({ error: 'Failed to save canvas state' }, { status: 500 })
  }
}

// DELETE /api/workflows/[id]/canvas — clear canvas state
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  canvasRepository.remove(params.id)
  return NextResponse.json({ ok: true })
}
