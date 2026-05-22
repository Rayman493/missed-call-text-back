/**
 * Utility functions for preserving debugAuth parameter during redirects
 */

export function preserveDebugAuthParam(url: string): string {
  if (typeof window === 'undefined') return url
  
  const currentUrl = new URL(window.location.href)
  const debugAuth = currentUrl.searchParams.get('debugAuth')
  
  if (debugAuth === 'true') {
    const targetUrl = new URL(url, window.location.origin)
    targetUrl.searchParams.set('debugAuth', 'true')
    return targetUrl.toString()
  }
  
  return url
}

export function getDebugAuthParam(): boolean {
  if (typeof window === 'undefined') return false
  
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get('debugAuth') === 'true'
}

export function addDebugAuthToUrl(url: string): string {
  if (typeof window === 'undefined') return url
  
  const targetUrl = new URL(url, window.location.origin)
  targetUrl.searchParams.set('debugAuth', 'true')
  return targetUrl.toString()
}
