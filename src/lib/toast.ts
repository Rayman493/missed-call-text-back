/**
 * Lightweight ephemeral toast feedback.
 * Creates a fixed bottom-right toast, shows it for 2 seconds, then fades out.
 */
export function showToast(message: string, _type?: 'info' | 'error' | 'success') {
  if (typeof document === 'undefined') return

  const toast = document.createElement('div')
  toast.className =
    'fixed bottom-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2.5 rounded-lg shadow-lg text-sm z-[100] animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-[min(90vw,320px)] text-center'
  toast.textContent = message
  document.body.appendChild(toast)

  setTimeout(() => {
    toast.classList.add('animate-out', 'fade-out', 'slide-out-to-bottom-2')
    setTimeout(() => toast.remove(), 300)
  }, 2000)
}
