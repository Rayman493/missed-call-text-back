export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertQaIsolation, getReplyFlowEnv } = await import('@/lib/runtime-env')
    assertQaIsolation()
    console.log(`[ENV] REPLYFLOW_ENV=${getReplyFlowEnv()}`)
  }
}
