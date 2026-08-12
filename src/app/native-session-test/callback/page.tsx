/**
 * ASWebAuthenticationSession Diagnostic Test Callback Page
 *
 * This is a temporary diagnostic callback route for testing ASWebAuthenticationSession.
 *
 * This page:
 * - Contains no PII, auth tokens, or billing data
 * - Performs no writes or state modifications
 * - Is public and harmless
 * - May not render if ASWebAuthenticationSession intercepts the URL (expected behavior)
 */

export default function NativeSessionTestCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-gray-600">Callback received</p>
      </div>
    </div>
  )
}