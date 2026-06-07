  import { NextRequest, NextResponse } from 'next/server'
  import { computeDiagnostic } from '@/lib/freeDiagnosticEngine'

  export async function POST(request: NextRequest) {
    try {
      const body = await request.json()
      const { organization_id, answers } = body

      // Validate request
      if (!organization_id || !answers) {
        return NextResponse.json(
          { message: 'Missing required fields: organization_id and answers' },
          { status: 400 }
        )
      }

      // Validate answers structure
      if (typeof answers !== 'object' || Object.keys(answers).length !== 12) {
        return NextResponse.json(
          { message: 'Invalid answers format. Expected 12 question answers.' },
          { status: 400 }
        )
      }

      // Validate answer values are 0-3
      for (const [key, value] of Object.entries(answers)) {
        if (typeof value !== 'number' || value < 0 || value > 3) {
          return NextResponse.json(
            { 
              message: `Invalid answer value for ${key}: ${value}. Values must be 0, 1, 2, or 3.` 
            },
            { status: 400 }
          )
        }
      }

      // Compute diagnostic using deterministic engine
      const result = computeDiagnostic(answers as Record<string, 0 | 1 | 2 | 3>)

      // Return response
      return NextResponse.json({
        status: 'success',
        type: 'free_diagnostic',
        version: 'v2',
        data: result,
        // Also spread top-level for backward compat with service validation
        ...result,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('[API] Free diagnostic error:', error)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }
  }
