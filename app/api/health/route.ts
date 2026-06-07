/**
 * Health check endpoint
 * 
 * Validates that all required environment variables are configured
 * and returns the application health status.
 */

import { NextResponse } from 'next/server'
import { validateConfig } from '@/lib/config'

export async function GET() {
  const validation = validateConfig()
  
  if (!validation.valid) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: 'Missing required environment variables',
        missingVars: validation.missingVars,
        message: `Please configure the following environment variables in .env.local: ${validation.missingVars.join(', ')}`
      },
      { status: 500 }
    )
  }
  
  return NextResponse.json({
    status: 'healthy',
    message: 'All required environment variables are configured',
    timestamp: new Date().toISOString()
  })
}
