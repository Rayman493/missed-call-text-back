import Link from 'next/link'

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  return (
    <main className="min-h-screen p-8 bg-slate-950 text-white">
      <a href="/dashboard" className="text-blue-400">← Back to dashboard</a>
      <h1 className="mt-6 text-2xl font-bold">Lead Details</h1>
      <p className="mt-4">Lead detail route loaded: {params.id}</p>
    </main>
  );
}
