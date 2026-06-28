'use client'

export default function AppLoadingScreen() {
  const steps = [
    'Activating your ReplyFlow account',
    'Confirming your trial',
    'Setting up your ReplyFlow number',
    'Finalizing your account setup'
  ]

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4">
      {/* Logo - using actual ReplyFlow logo */}
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
        Setting up your account
      </h1>

      {/* Reassuring subtitle */}
      <p className="text-slate-400 text-sm sm:text-base mb-8">
        This usually takes less than a minute.
      </p>

      {/* Step-based progress */}
      <div className="max-w-md w-full space-y-3">
        {steps.map((step, index) => (
          <div
            key={index}
            className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
              index === 0
                ? 'bg-blue-900/30 border border-blue-500/50'
                : 'bg-slate-900/50 border border-slate-800'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                index === 0
                  ? 'bg-blue-500'
                  : 'bg-slate-700'
              }`}
            >
              {index === 0 && (
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              )}
            </div>
            <p
              className={`text-sm sm:text-base ${
                index === 0
                  ? 'text-white font-medium'
                  : 'text-slate-500'
              }`}
            >
              {step}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
