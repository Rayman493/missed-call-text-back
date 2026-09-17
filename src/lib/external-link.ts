/**
 * Open an external URL in a new tab/window and clear stale mobile focus/active
 * state on the triggering element.
 *
 * Mobile WebViews can leave a button visually highlighted after the browser
 * hands off to the external app. Blurring the touch target on coarse pointers
 * clears the stale active/focus appearance without affecting desktop keyboard
 * :focus-visible behavior.
 */
export function openExternalLink(url: string | null | undefined, event?: { currentTarget?: Element }) {
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
  if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) {
    if (event?.currentTarget && 'blur' in event.currentTarget && typeof event.currentTarget.blur === 'function') {
      ;(event.currentTarget as HTMLElement).blur()
    }
  }
}
