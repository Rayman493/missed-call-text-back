/**
 * Health endpoint payload. The commit identity is the authoritative
 * BUILD_COMMIT_SHA injected at Docker build time — never a stale hardcoded
 * literal. Missing metadata degrades to "unknown" without failing health.
 */
export function buildHealthPayload() {
  return {
    status: 'healthy',
    service: 'ai-voice-poc',
    commit: process.env.BUILD_COMMIT_SHA || 'unknown',
    hangupRouter: 'v3',
  };
}
