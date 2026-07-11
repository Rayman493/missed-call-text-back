import BrandLoader from '@/components/BrandLoader'

export default function GenericLoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4">
      <BrandLoader size={80} />
      <p className="text-slate-400 text-sm mt-4">Loading ReplyFlow...</p>
    </div>
  )
}
