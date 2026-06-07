/**
 * API Route: GET /api/agents, POST /api/agents
 * 
 * Proxies agent list and creation requests to the VPS bridge backend.
 * All operations are workspace-scoped via the backend service.
 * 
 * This route acts as a secure proxy to the VPS bridge, ensuring API keys
 * are not exposed to the frontend.
 */

import { NextRequest } from 'next/server'
import { getConfig } from '@/lib/config'
import { createErrorResponse } from '@/types/errors'
import type { CreateAgentRequest, AgentListResponse } from '@/types/agents'

/**
 * GET /api/agents
 * 
 * Query params:
 *   - q: search by name/description
 *   - status: filter by status (draft, active, disabled)
 *   - page: pagination (default 1)
 *   - pageSize: items per page (default 20)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Build query string for backend
    const queryParams = new URLSearchParams()
    if (searchParams.has('q')) queryParams.append('q', searchParams.get('q')!)
    if (searchParams.has('status')) queryParams.append('status', searchParams.get('status')!)
    if (searchParams.has('page')) queryParams.append('page', searchParams.get('page')!)
    if (searchParams.has('pageSize')) queryParams.append('pageSize', searchParams.get('pageSize')!)

    // Get VPS bridge configuration
    const config = getConfig()

    // Forward request to VPS bridge
    const response = await fetch(
      `${config.VPS_BRIDGE_URL}/agents?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: {},
      }
    )

    // Handle VPS bridge errors
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

    // Parse and return successful response
    const data = await response.json() as AgentListResponse

    return Response.json(data)

  } catch (error) {
    // Handle configuration errors
    if (error instanceof Error && error.message.includes('Missing required environment variables')) {
      return Response.json(
        createErrorResponse(
          'ConfigurationError',
          'Server configuration error',
          { message: error.message }
        ),
        { status: 500 }
      )
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return Response.json(
        createErrorResponse(
          'NetworkError',
          'Service temporarily unavailable. Please try again.',
          { message: error.message }
        ),
        { status: 503 }
      )
    }

    // Handle unexpected errors
    console.error('Agent list fetch error:', error)
    return Response.json(
      createErrorResponse(
        'InternalError',
        'An unexpected error occurred',
        { message: error instanceof Error ? error.message : 'Unknown error' }
      ),
      { status: 500 }
    )
  }
}

/**
 * POST /api/agents
 * 
 * Creates a new agent.
 * Required body: name, model, provider
 * Optional: description, runtime, tags
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as CreateAgentRequest

    // Validate required fields
    if (!body.name || !body.model || !body.provider) {
      return Response.json(
        createErrorResponse(
          'ValidationError',
          'Missing required fields: name, model, provider'
        ),
        { status: 400 }
      )
    }

    // Get VPS bridge configuration
    const config = getConfig()

    // Forward request to VPS bridge
    const response = await fetch(`${config.VPS_BRIDGE_URL}/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    // Handle VPS bridge errors
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

    // Parse and return successful response
    const data = await response.json()

    return Response.json(data, { status: 201 })

  } catch (error) {
    // Handle configuration errors
    if (error instanceof Error && error.message.includes('Missing required environment variables')) {
      return Response.json(
        createErrorResponse(
          'ConfigurationError',
          'Server configuration error',
          { message: error.message }
        ),
        { status: 500 }
      )
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return Response.json(
        createErrorResponse(
          'NetworkError',
          'Service temporarily unavailable. Please try again.',
          { message: error.message }
        ),
        { status: 503 }
      )
    }

    // Handle unexpected errors
    console.error('Agent creation error:', error)
    return Response.json(
      createErrorResponse(
        'InternalError',
        'An unexpected error occurred',
        { message: error instanceof Error ? error.message : 'Unknown error' }
      ),
      { status: 500 }
    )
  }
}
