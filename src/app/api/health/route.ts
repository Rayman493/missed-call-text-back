import { NextResponse } from 'next/server'
import { validateEnvironment } from '@/lib/env-validation'

export const dynamic = 'force-dynamic'

export async function GET() {
  const envValidation = validateEnvironment()
  
  return NextResponse.json({
    ok: envValidation.valid,
    status: envValidation.valid ? 'healthy' : 'unhealthy',
    service: 'replyflow-next',
    timestamp: new Date().toISOString(),
    environment: {
      valid: envValidation.valid,
      missingCount: envValidation.missing.length,
      missingVars: envValidation.missing,
      warningCount: envValidation.warnings.length,
      warningVars: envValidation.optionalMissing,
    }
  })
}
