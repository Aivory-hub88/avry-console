/**
 * API Route: GET /api/agents/[id], PATCH /api/agents/[id], DELETE /api/agents/[id]
 * 
 * Proxies agent detail, update, and delete requests to the VPS bridge backend.
 * All operations are workspace-scoped via the backend service.
 * 
 * This route acts as a secure proxy to the VPS bridge, ensuring API keys
 * are not exposed to the frontend.
 */

import { NextRequest } from 'next/server'
import { getConfig } from '@/lib/config'
import { createErrorResponse } from '@/types/errors'
import type { UpdateAgentRequest } from '@/types/agents'

/**
 * GET /api/agents/[id]
 * 
 * Fetches a single agent by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    // Validate agent ID
    if (!id || typeof id !== 'string') {
      return Response.json(
        createErrorResponse(
          'ValidationError',
          'Agent ID is required and must be a string'
        ),
        { status: 400 }
      )
    }

    // Get VPS bridge configuration
    const config = getConfig()

    // Forward request to VPS bridge
    const response = await fetch(`${config.VPS_BRIDGE_URL}/agents/${id}`, {
      method: 'GET',
      headers: {},
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
    console.error('Agent fetch error:', error)
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
 * PATCH /api/agents/[id]
 * 
 * Updates an agent.
 * Can update: name, description, status, model, provider, runtime, tags, config
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json() as UpdateAgentRequest

    // Validate agent ID
    if (!id || typeof id !== 'string') {
      return Response.json(
        createErrorResponse(
          'ValidationError',
          'Agent ID is required and must be a string'
        ),
        { status: 400 }
      )
    }

    // Get VPS bridge configuration
    const config = getConfig()

    // Forward request to VPS bridge
    const response = await fetch(`${config.VPS_BRIDGE_URL}/agents/${id}`, {
      method: 'PATCH',
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
    console.error('Agent update error:', error)
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
 * DELETE /api/agents/[id]
 * 
 * Soft deletes an agent (sets deletedAt and status = 'disabled').
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    // Validate agent ID
    if (!id || typeof id !== 'string') {
      return Response.json(
        createErrorResponse(
          'ValidationError',
          'Agent ID is required and must be a string'
        ),
        { status: 400 }
      )
    }

    // Get VPS bridge configuration
    const config = getConfig()

    // Forward request to VPS bridge
    const response = await fetch(`${config.VPS_BRIDGE_URL}/agents/${id}`, {
      method: 'DELETE',
      headers: {},
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

    // Return 204 No Content on successful deletion
    return new Response(null, { status: 204 })

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
    console.error('Agent delete error:', error)
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
