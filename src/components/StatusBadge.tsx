export default function StatusBadge({ status, errorCode }: { status?: string; errorCode?: string | null }) {
  // Override for carrier blocking
  if (errorCode === '30007') {
    return (
      <span className="px-3 py-1.5 rounded-md text-sm font-semibold inline-flex items-center gap-1.5 bg-red-100 text-red-700 border border-red-200">
        <span className="text-base">🚫</span>
        <span>Blocked (Carrier)</span>
      </span>
    );
  }

  const statusConfig = {
    queued: { 
      label: "Sending...", 
      icon: (
        <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
        </svg>
      ), 
      style: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600" 
    },
    sending: { 
      label: "Sending...", 
      icon: (
        <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
        </svg>
      ), 
      style: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 border border-blue-200 dark:border-blue-800" 
    },
    sent: { 
      label: "Sent", 
      icon: "→", 
      style: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 border border-blue-200 dark:border-blue-800" 
    },
    delivered: { 
      label: "Delivered", 
      icon: "✓", 
      style: "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 border border-green-200 dark:border-green-800" 
    },
    failed: { 
      label: "Failed", 
      icon: "✕", 
      style: "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 border border-red-200 dark:border-red-800" 
    },
    undelivered: { 
      label: "Failed", 
      icon: "✕", 
      style: "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 border border-red-200 dark:border-red-800" 
    },
  };

  // Handle null/undefined status - treat as pending
  if (!status) {
    const config = statusConfig.queued;
    return (
      <span className={`px-3 py-1.5 rounded-md text-sm font-semibold inline-flex items-center gap-1.5 ${config.style}`}>
        {config.icon}
        <span>{config.label}</span>
      </span>
    );
  }

  // Only allow known statuses - no UNKNOWN fallback
  const config = statusConfig[status as keyof typeof statusConfig];
  if (!config) {
    // Default to queued for unknown statuses to avoid showing errors
    const defaultConfig = statusConfig.queued;
    return (
      <span className={`px-3 py-1.5 rounded-md text-sm font-semibold inline-flex items-center gap-1.5 ${defaultConfig.style}`}>
        {defaultConfig.icon}
        <span>{defaultConfig.label}</span>
      </span>
    );
  }

  return (
    <span className={`px-3 py-1.5 rounded-md text-sm font-semibold inline-flex items-center gap-1.5 ${config.style}`}>
      <span className="text-base">{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}
