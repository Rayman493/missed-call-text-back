# @replyflow/capacitor-stripe-terminal (scaffold)

Phase 2 scaffold for a first-party Capacitor plugin wrapper for Stripe Terminal (Tap to Pay on iOS/Android).

This package only includes TypeScript-facing types and a Web fallback. Native iOS/Android plugins to be added in subsequent steps.

API surface (initial):
- initialize(options?)
- isSupported()
- requestConnectionToken() [JS-implemented callback]
- connectTapToPay(options)
- collectPayment(options)
- cancel()
- disconnect()
- teardown()
- events: statusChanged, paymentSucceeded, paymentFailed, error

Security: no Stripe secrets are embedded. Connection tokens must be fetched via authenticated backend.
