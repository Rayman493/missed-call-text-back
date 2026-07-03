'use client'

export default function CheckoutRedirectLoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="mb-8">
        <img
          src="/replyflow-r-logo.png"
          alt="ReplyFlow"
          width={80}
          height={80}
          className="object-contain animate-pulse"
        />
      </div>

      {/* Spinner */}
      <div className="relative mb-8">
        <div className="w-14 h-14 border-4 border-blue-600/30 border-t-blue-600 border-solid rounded-full animate-spin"></div>
      </div>

      {/* Main loading text */}
      <h1 className="text-white text-xl sm:text-2xl font-semibold mb-2 animate-pulse">
        Redirecting you to complete your free trial setup...
      </h1>

      {/* Reassuring subtitle */}
      <p className="text-slate-400 text-sm sm:text-base">
        You&apos;ll be redirected to Stripe Checkout to activate your 14-day free trial.
      </p>
    </div>
  )
}
