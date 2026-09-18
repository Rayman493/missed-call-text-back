/**
 * Lightweight ephemeral toast feedback.
 * Shares the canonical ReplyFlow toast visual treatment (popover surface,
 * rounded corners, subtle border, safe-area aware, brief auto-dismiss,
 * accessible announcement).
 *
 * When an anchor element is provided the toast is positioned just above that
 * control so it never overlaps the floating bottom nav. Otherwise it appears
 * in the canonical elevated position above the bottom nav + safe-area.
 */
export function showToast(
  message: string,
  _type?: 'info' | 'error' | 'success',
  options?: { anchor?: Element | null; duration?: number }
) {
  if (typeof document === 'undefined') return

  const duration = options?.duration ?? 2000
  const toast = document.createElement('div')
  toast.setAttribute('role', 'status')
  toast.setAttribute('aria-live', 'polite')
  toast.className =
    'fixed bg-popover text-popover-foreground border border-border px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-[100] animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-[min(90vw,320px)] text-center'
  toast.textContent = message

  if (options?.anchor) {
    const rect = options.anchor.getBoundingClientRect()
    const toastHeight = 44
    const spaceAbove = rect.top
    if (spaceAbove >= toastHeight + 8) {
      toast.style.top = `${spaceAbove - toastHeight - 8}px`
    } else {
      toast.style.top = `${rect.bottom + 8}px`
    }
    toast.style.left = `${rect.left + rect.width / 2}px`
    toast.style.transform = 'translateX(-50%)'
  } else {
    // Canonical position: centered, above the 4.5rem bottom nav + safe area.
    toast.classList.add('left-1/2', '-translate-x-1/2')
    toast.style.bottom = 'calc(4.5rem + env(safe-area-inset-bottom) + 0.5rem)'
  }

  document.body.appendChild(toast)

  setTimeout(() => {
    toast.classList.add('animate-out', 'fade-out', 'slide-out-to-bottom-2')
    setTimeout(() => toast.remove(), 300)
  }, duration)
}
