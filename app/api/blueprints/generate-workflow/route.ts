/**
 * API Route: POST /api/blueprints/generate-workflow
 *
 * Proxy to VPS Bridge /blueprints/generate-workflow.
 * Generates a detailed executable workflow definition from a blueprint module.
 */

import { NextRequest } from 'next/server'
import { getConfig } from '@/lib/config'
import { createErrorResponse } from '@/types/errors'

export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workflow_id, workflow_title, workflow_steps, diagnostic_context, company_name } = body

    if (!workflow_id || !workflow_title) {
      return Response.json(
        createErrorResponse(
          'ValidationError',
          'Missing required fields: workflow_id, workflow_title',
          { required: ['workflow_id', 'workflow_title'], received: { workflow_id, workflow_title } }
        ),
        { status: 400 }
      )
    }

    const config = getConfig()

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120_000)

    let response: Response
    try {
      response = await fetch(`${config.VPS_BRIDGE_URL}/blueprints/generate-workflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workflow_id, workflow_title, workflow_steps, diagnostic_context, company_name }),
        signal: controller.signal
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return Response.json(
          createErrorResponse('TimeoutError', 'Workflow generation timed out. Please try again.'),
          { status: 504 }
        )
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      let errorData
      try {
        errorData = await response.json()
      } catch {
        errorData = { error: 'Unknown error', message: 'Failed to parse error response' }
      }
      return Response.json(
        createErrorResponse(
          errorData.error || 'ServiceError',
          errorData.message || 'VPS bridge request failed',
          errorData.details
        ),
        { status: response.status }
      )
    }

    const data = await response.json()
    return Response.json(data)

  } catch (error) {
    if (error instanceof Error && error.message.includes('Missing required environment variables')) {
      return Response.json(
        createErrorResponse('ConfigurationError', 'Server configuration error', { message: error.message }),
        { status: 500 }
      )
    }
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return Response.json(
        createErrorResponse('NetworkError', 'Service temporarily unavailable. Please try again.', { message: (error as Error).message }),
        { status: 503 }
      )
    }
    console.error('Workflow generation error:', error)
    return Response.json(
      createErrorResponse('InternalError', 'An unexpected error occurred', { message: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500 }
    )
  }
}
