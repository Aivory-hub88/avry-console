/**
 * Next.js instrumentation file
 * 
 * This file runs once when the Next.js server starts up.
 * We use it to validate environment configuration before the app serves requests.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only run on server-side
    const { validateConfig } = await import('./lib/config')
    
    const validation = validateConfig()
    
    if (!validation.valid) {
      console.error('❌ Configuration validation failed!')
      console.error(`Missing required environment variables: ${validation.missingVars.join(', ')}`)
      console.error('Please ensure these are set in your .env.local file:')
      validation.missingVars.forEach(varName => {
        console.error(`  - ${varName}`)
      })
      console.error('\nThe application may not function correctly without these variables.')
    } else {
      console.log('✅ Configuration validation passed')
      console.log('VPS Bridge URL:', process.env.VPS_BRIDGE_URL)
      console.log('VPS Bridge API Key: [CONFIGURED]')
    }
  }
}
