export default function StatusBadge({ status, errorCode }: { status?: string; errorCode?: string | null }) {
  // Debug log
  console.log('STATUS BADGE - status:', status, 'errorCode:', errorCode);

  // Override for carrier blocking
  if (errorCode === '30007') {
    return (
      <span className="px-3 py-1.5 rounded-md text-sm font-semibold inline-flex items-center gap-1.5 bg-red-100 text-red-700 border border-red-200">
        <span className="text-base">🚫</span>
        <span>Blocked (Carrier)</span>
      </span>
    );
  }

  const statusMap: Record<string, { label: string; icon: string; style: string }> = {
    delivered: { label: "Delivered", icon: "✓", style: "bg-green-100 text-green-700 border border-green-200" },
    sent: { label: "Sent", icon: "→", style: "bg-blue-100 text-blue-700 border border-blue-200" },
    queued: { label: "Sending...", icon: "…", style: "bg-gray-100 text-gray-700 border border-gray-200" },
    failed: { label: "Failed", icon: "✕", style: "bg-red-100 text-red-700 border border-red-200" },
    undelivered: { label: "Failed", icon: "✕", style: "bg-red-100 text-red-700 border border-red-200" },
  };

  // Handle null status
  if (!status) {
    return (
      <span className="px-3 py-1.5 rounded-md text-sm font-semibold inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 border border-gray-200">
        <span className="text-base">…</span>
        <span>Pending...</span>
      </span>
    );
  }

  const config = statusMap[status] || { label: "Unknown", icon: "?", style: "bg-gray-100 text-gray-700 border border-gray-200" };

  return (
    <span className={`px-3 py-1.5 rounded-md text-sm font-semibold inline-flex items-center gap-1.5 ${config.style}`}>
      <span className="text-base">{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}
