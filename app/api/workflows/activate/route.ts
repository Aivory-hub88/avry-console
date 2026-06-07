import { NextRequest, NextResponse } from 'next/server'
import { deployAndActivateWithCreds, classifyN8nError } from '@/lib/workflows/n8nClient'
import type { N8nConnectionParams } from '@/lib/workflows/n8nClient'
import type { AivoryWorkflowSpec } from '@/types/workflow'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  let instanceUrl = 'unknown'

  try {
    const body = await request.json()
    const { workflow_id, workflow_data, n8n_instance_url, n8n_api_key } = body

    // Validate required credentials
    if (!n8n_instance_url || !n8n_api_key) {
      return NextResponse.json(
        { error: 'n8n instance URL and API key are required', code: 'MISSING_CREDENTIALS' },
        { status: 400 }
      )
    }

    // Track instance URL for error classification
    instanceUrl = n8n_instance_url

    if (!workflow_id || !workflow_data) {
      return NextResponse.json(
        { error: 'Missing workflow_id or workflow_data' },
        { status: 400 }
      )
    }

    // Build connection params from user-provided credentials
    const conn: N8nConnectionParams = {
      instanceUrl: n8n_instance_url,
      apiKey: n8n_api_key,
    }

    // Build the spec object expected by deployAndActivateWithCreds
    const spec: AivoryWorkflowSpec = {
      id: workflow_id,
      title: workflow_data.title || 'Untitled Workflow',
      status: 'draft',
      source: 'n8n',
      company_name: workflow_data.company_name || '',
      trigger: workflow_data.trigger || 'webhook',
      steps: workflow_data.steps || [],
      integrations: [],
      estimated_time: '',
      automation_percentage: '',
      createdAt: workflow_data.created_at || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    console.log('[activate] Deploying workflow with user-provided credentials:', {
      instanceUrl: n8n_instance_url,
      workflowId: workflow_id,
      title: spec.title,
    })

    // Deploy and activate using user-provided credentials
    const result = await deployAndActivateWithCreds(spec, conn)

    // Construct n8n_url using user's instance URL
    const instanceBase = n8n_instance_url.replace(/\/+$/, '')
    const n8nUrl = `${instanceBase}/workflow/${result.n8nWorkflowId}`

    // Build webhook URL if available
    const n8nWebhookUrl = result.n8nWebhookPath
      ? `${instanceBase}${result.n8nWebhookPath}`
      : null

    console.log('[activate] Workflow activated successfully:', {
      n8nWorkflowId: result.n8nWorkflowId,
      n8nUrl,
    })

    return NextResponse.json({
      success: true,
      n8n_workflow_id: result.n8nWorkflowId,
      n8n_url: n8nUrl,
      n8nWebhookUrl,
    })
  } catch (error) {
    console.error('[activate] Error:', error)

    // Use classifyN8nError to map the error to a structured response
    const classified = classifyN8nError(error, instanceUrl)

    return NextResponse.json(
      { error: classified.message, code: classified.code },
      { status: classified.status }
    )
  }
}
