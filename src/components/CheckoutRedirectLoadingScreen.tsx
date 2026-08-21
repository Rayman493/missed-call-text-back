'use client'

export default function CheckoutRedirectLoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
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
        <div className="w-14 h-14 border-4 border-primary/30 border-t-primary border-solid rounded-full animate-spin"></div>
      </div>

      {/* Main loading text */}
      <h1 className="text-foreground text-xl sm:text-2xl font-semibold mb-2 animate-pulse">
        Redirecting you to complete your free trial setup...
      </h1>

      {/* Reassuring subtitle */}
      <p className="text-muted-foreground text-sm sm:text-base">
        You&apos;ll be redirected to Stripe Checkout to activate your 14-day free trial.
      </p>
    </div>
  )
}
