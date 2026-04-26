export default function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    delivered: "bg-green-100 text-green-700",
    sent: "bg-blue-100 text-blue-700",
    queued: "bg-gray-100 text-gray-700",
    failed: "bg-red-100 text-red-700",
    undelivered: "bg-orange-100 text-orange-700",
  };

  const style = map[status || ""] || "bg-gray-100 text-gray-700";

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${style}`}>
      {status || "unknown"}
    </span>
  );
}
