'use client'

import { redirect } from 'next/navigation'
import { useEffect } from 'react'

export default function SignInPage() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      const redirectParam = url.searchParams.get('redirect')
      console.log('[TRACE Signin Render]', {
        pathname: window.location.pathname,
        search: window.location.search,
        redirectParam,
        referrer: document.referrer,
        reasonIfKnown: 'signin_page_redirect_to_auth'
      })
    }
  }, [])
  
  redirect('/auth?mode=signin')
}
