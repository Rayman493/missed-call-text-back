'use client'

import { redirect } from 'next/navigation'
import { useEffect } from 'react'

export default function SignInPage() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      const redirectParam = url.searchParams.get('redirect')
      const returnToParam = url.searchParams.get('returnTo')
      console.log('[TRACE Signin Render]', {
        pathname: window.location.pathname,
        search: window.location.search,
        redirectParam,
        returnToParam,
        referrer: document.referrer,
        reasonIfKnown: 'signin_page_redirect_to_auth'
      })
    }
  }, [])

  // Handle returnTo parameter for post-login redirect
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      const returnToParam = url.searchParams.get('returnTo')
      
      if (returnToParam) {
        console.log('[Signin] Redirecting to auth with returnTo:', returnToParam)
        redirect(`/auth?mode=signin&returnTo=${encodeURIComponent(returnToParam)}`)
      } else {
        redirect('/auth?mode=signin')
      }
    }
  }, [])
}
