export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertQaIsolation, getReplyFlowEnv } = await import('@/lib/runtime-env')
    const raw = (process.env.REPLYFLOW_ENV || '').trim().toLowerCase()
    if (raw && !['production', 'qa', 'development', 'dev', 'local'].includes(raw)) {
      console.error(`[ENV ISOLATION] Unrecognized REPLYFLOW_ENV="${process.env.REPLYFLOW_ENV}" — treating as production. Expected production|qa|development.`)
    }
    assertQaIsolation()
    console.log(`[ENV] REPLYFLOW_ENV=${getReplyFlowEnv()}`)
  }
}
