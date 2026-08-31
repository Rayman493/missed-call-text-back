'use client'

interface AppLoadingScreenProps {
  isFirstTimeSetup?: boolean
}

export default function AppLoadingScreen({ isFirstTimeSetup = true }: AppLoadingScreenProps) {
  const steps = isFirstTimeSetup ? [
    'Activating your ReplyFlow account',
    'Confirming your trial',
    'Setting up your ReplyFlow number',
    'Finalizing your account setup'
  ] : []

  const title = isFirstTimeSetup ? 'Setting up your account' : 'Loading...'
  const subtitle = isFirstTimeSetup ? 'This usually takes less than a minute.' : 'Please wait...'

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
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
        <div className="w-14 h-14 border-4 border-primary/30 border-t-primary border-solid rounded-full animate-spin"></div>
      </div>

      {/* Main loading text */}
      <h1 className="text-foreground text-xl sm:text-2xl font-semibold mb-2 animate-pulse">
        {title}
      </h1>

      {/* Reassuring subtitle */}
      <p className="text-muted-foreground text-sm sm:text-base mb-8">
        {subtitle}
      </p>

      {/* Step-based progress - only show for first-time setup */}
      {isFirstTimeSetup && (
        <div className="max-w-md w-full space-y-3">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                index === 0
                  ? 'bg-primary/10 border border-primary/20'
                  : 'bg-muted/50 border border-border'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  index === 0
                    ? 'bg-primary'
                    : 'bg-muted-foreground/30'
                }`}
              >
                {index === 0 && (
                  <div className="w-2 h-2 bg-primary-foreground rounded-full animate-pulse"></div>
                )}
              </div>
              <p
                className={`text-sm sm:text-base ${
                  index === 0
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground'
                }`}
              >
                {step}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
