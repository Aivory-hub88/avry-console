import { NextRequest, NextResponse } from 'next/server'
import { workflowRepository } from '@/lib/workflows/repository'
import { deployAndActivate } from '@/lib/workflows/n8nClient'
import type { AivoryWorkflowSpec } from '@/types/workflow'

export const maxDuration = 30

/**
 * POST /api/workflows/[id]/activate
 *
 * Deploys the workflow to n8n (create or update) and activates it.
 * Idempotent: calling it on an already-active workflow re-deploys and re-activates.
 *
 * Body (optional): { spec: AivoryWorkflowSpec }
 * If the workflow is not found in the in-memory repo (e.g. after a hot-reload in dev),
 * the caller can pass the full spec in the body so activation still works.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  // 1. Try to load from repo; fall back to body-provided spec
  let spec = workflowRepository.get(id)

  if (!spec) {
    // Attempt to recover from request body (client sends full spec as fallback)
    // This handles the case where the in-memory store was reset (e.g. dev hot-reload)
    try {
      const body = await request.json().catch(() => null)
      if (body?.spec && body.spec.id === id) {
        const incoming = body.spec as AivoryWorkflowSpec
        // Re-register in the store so the update() call at step 4 succeeds
        spec = workflowRepository.upsert(incoming)
      }
    } catch {
      // body parse failed — fall through to 404
    }
  }

  if (!spec) {
    console.error('[activate] workflow not found in repo', { id })
    return NextResponse.json(
      { error: 'Workflow not found. Try saving the workflow again before activating.' },
      { status: 404 }
    )
  }

  // 2. Check n8n config early
  if (!process.env.N8N_API_KEY) {
    return NextResponse.json({ error: 'n8n API not configured (N8N_API_KEY missing)' }, { status: 500 })
  }

  try {
    // 3. Deploy draft to n8n, then activate.
    //    onDraftCreated fires as soon as the draft exists in n8n — before activation —
    //    so the n8n workflow ID + webhook path are persisted even if activation later fails.
    const { n8nWorkflowId, n8nWorkflowUrl, n8nWebhookPath } = await deployAndActivate(spec, (draftId, draftUrl, webhookPath) => {
      workflowRepository.update(id, {
        n8n_workflow_id: draftId,
        n8n_url: draftUrl,
        n8nWebhookPath: webhookPath,
      })
      console.log('[activate] Draft ID + webhook path saved to repo', { id, draftId, webhookPath })
    })

    // 4. Only mark Aivory status as active after n8n confirms activation
    const updated = workflowRepository.update(id, {
      status: 'active',
      n8n_workflow_id: n8nWorkflowId,
      n8n_url: n8nWorkflowUrl,
      n8nWebhookPath,
    })

    console.log('[activate] Workflow deployed and activated', { id, n8nWorkflowId, n8nWebhookPath })

    return NextResponse.json(updated)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[activate] n8n activation error', { id, message })
    // Do NOT set Aivory status to active — only happens on success above.
    return NextResponse.json(
      { error: 'n8n_activation_failed', details: message },
      { status: 502 }
    )
  }
}
