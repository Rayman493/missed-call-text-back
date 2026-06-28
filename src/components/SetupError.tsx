'use client'

export default function SetupError() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="max-w-lg w-full bg-card rounded-lg shadow-lg p-8">
        <div className="flex items-center justify-center w-16 h-16 bg-red-900/30 rounded-full mb-6">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        
        <h1 className="text-2xl font-bold text-foreground mb-4">Setup Required</h1>
        
        <p className="text-muted-foreground mb-6">
          This application requires environment variables to be configured. Please set the following environment variables:
        </p>
        
        <div className="bg-muted rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-foreground mb-3">Required Environment Variables:</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start">
              <code className="bg-secondary px-2 py-1 rounded text-xs font-mono mr-2 text-foreground">NEXT_PUBLIC_SUPABASE_URL</code>
              <span className="text-muted-foreground">Your Supabase project URL</span>
            </li>
            <li className="flex items-start">
              <code className="bg-secondary px-2 py-1 rounded text-xs font-mono mr-2 text-foreground">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
              <span className="text-muted-foreground">Your Supabase anonymous/public key</span>
            </li>
          </ul>
        </div>
        
        <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-100 mb-2">How to fix:</h3>
          <ol className="text-sm text-blue-200 space-y-1 list-decimal list-inside">
            <li>Create a <code className="bg-blue-800 px-1 rounded text-blue-100">.env.local</code> file in the project root</li>
            <li>Add the required environment variables</li>
            <li>Restart the development server</li>
          </ol>
        </div>
        
        <p className="text-xs text-muted-foreground">
          Contact your administrator if you need help with setup.
        </p>
      </div>
    </div>
  )
}
