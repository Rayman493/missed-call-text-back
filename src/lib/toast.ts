/**
 * Lightweight ephemeral toast feedback.
 * Shares the canonical ReplyFlow toast visual treatment (popover surface,
 * rounded corners, subtle border, safe-area aware, brief auto-dismiss,
 * accessible announcement). Creates a fixed bottom toast, shows it for
 * 2 seconds, then fades out.
 */
export function showToast(message: string, _type?: 'info' | 'error' | 'success') {
  if (typeof document === 'undefined') return

  const toast = document.createElement('div')
  toast.setAttribute('role', 'status')
  toast.setAttribute('aria-live', 'polite')
  toast.className =
    'fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 bg-popover text-popover-foreground border border-border px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-[100] animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-[min(90vw,320px)] text-center'
  toast.textContent = message
  document.body.appendChild(toast)

  setTimeout(() => {
    toast.classList.add('animate-out', 'fade-out', 'slide-out-to-bottom-2')
    setTimeout(() => toast.remove(), 300)
  }, 2000)
}
