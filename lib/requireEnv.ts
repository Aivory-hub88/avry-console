// Fail-fast URL resolver. These URLs used to fall back to a retired, compromised
// VPS when env vars were missing, silently sending traffic to it. Refusing to
// fall back is intentional: a loud error beats quiet traffic leakage.
//
//  - Server runtime: throws if none of the names is set.
//  - Build (NEXT_PHASE=phase-production-build): returns a placeholder so
//    page-data collection does not crash.
//  - Browser: process.env is empty (only NEXT_PUBLIC_* is inlined), so return ''.

export function requireUrl(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n]
    if (v) return v.replace(/\/$/, '')
  }
  if (typeof window !== 'undefined') return ''
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return 'http://__missing_env_at_build_time__'
  }
  throw new Error(`${names.join(' or ')} env var is required (no default host is used)`)
}
