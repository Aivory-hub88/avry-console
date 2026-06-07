/**
 * API Route: GET /api/blueprints/[id]/versions
 * 
 * Fetches all versions of a blueprint by ID.
 * This route acts as a secure proxy to the VPS bridge, ensuring API keys
 * are not exposed to the frontend.
 * 
 * Requirements: 1.1, 1.2, 4.4, 5.5, 5.6, 5.8
 */

import { NextRequest } from 'next/server'
import { getConfig } from '@/lib/config'
import { createErrorResponse } from '@/types/errors'
import type { BlueprintVersionsResponse } from '@/types/blueprint'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    // Validate blueprint ID
    if (!id || typeof id !== 'string') {
      return Response.json(
        createErrorResponse(
          'ValidationError',
          'Blueprint ID is required and must be a string'
        ),
        { status: 400 }
      )
    }

    // Get VPS bridge configuration
    const config = getConfig()

    // Forward request to VPS bridge
    const response = await fetch(`${config.VPS_BRIDGE_URL}/blueprints/${id}/versions`, {
      method: 'GET',
      headers: {}
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
    const data = await response.json() as BlueprintVersionsResponse

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
    console.error('Blueprint versions fetch error:', error)
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
