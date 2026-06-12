import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const DASHBOARD_ROUTES = ['/dashboard', '/onboarding', '/settings', '/leads', '/conversations']

export function useDashboardRouteTracking() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname) return
    
    // Check if current route is a dashboard route
    const isDashboardRoute = DASHBOARD_ROUTES.some(route => pathname.startsWith(route))

    if (isDashboardRoute) {
      // Never store lead detail routes - only list-level routes
      if (pathname.startsWith('/dashboard/leads/') && pathname !== '/dashboard/leads') {
        console.log('[Dashboard Route Tracking] Skipped detail route:', pathname)
        return
      }

      // Save to cookie with 30 day expiration
      const expires = new Date()
      expires.setDate(expires.getDate() + 30)
      
      document.cookie = `last_dashboard_route=${pathname}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`
      
      console.log('[Dashboard Route Tracking] Saved route:', pathname)
    }
  }, [pathname])
}
