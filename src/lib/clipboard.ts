/**
 * Clipboard utilities with toast notifications
 */

// Check if we're in a browser environment
const isClient = typeof window !== 'undefined' && typeof document !== 'undefined';

export function copyToClipboard(text: string, label: string = 'Copied to clipboard'): Promise<boolean> {
  if (!isClient) {
    // Return resolved promise for server-side rendering
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    if (navigator.clipboard && window.isSecureContext) {
      // Use modern clipboard API
      navigator.clipboard.writeText(text).then(
        () => {
          showToast(label);
          resolve(true);
        },
        (err) => {
          console.error('Failed to copy text: ', err);
          fallbackCopyTextToClipboard(text, label);
          resolve(false);
        }
      );
    } else {
      // Fallback for older browsers
      fallbackCopyTextToClipboard(text, label);
      resolve(true);
    }
  });
}

function fallbackCopyTextToClipboard(text: string, label: string) {
  if (!isClient) return;
  
  const textArea = document.createElement('textarea');
  textArea.value = text;
  
  // Avoid scrolling to bottom
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.position = 'fixed';
  
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    const successful = document.execCommand('copy');
    if (successful) {
      showToast(label);
    }
  } catch (err) {
    console.error('Fallback: Oops, unable to copy', err);
  }
  
  document.body.removeChild(textArea);
}

function showToast(message: string) {
  if (!isClient) return;
  
  // Create toast element
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2 animate-fade-in';
  toast.innerHTML = `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
    </svg>
    <span class="text-sm font-medium">${message}</span>
  `;
  
  document.body.appendChild(toast);
  
  // Remove after 2 seconds
  setTimeout(() => {
    toast.classList.add('animate-fade-out');
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 300);
  }, 2000);
}

// Add CSS animations (only on client side)
if (isClient) {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fade-out {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(10px); }
    }
    .animate-fade-in {
      animation: fade-in 0.3s ease-out;
    }
    .animate-fade-out {
      animation: fade-out 0.3s ease-out;
    }
  `;
  document.head.appendChild(style);
}
