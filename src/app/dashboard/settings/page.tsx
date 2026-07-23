import SettingsContent from '@/components/SettingsContent'
import TapToPayDiagnosticsPanel from '@/components/TapToPayDiagnosticsPanel'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SettingsPage({ searchParams }: { searchParams?: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const sp = searchParams ? await searchParams : undefined
  const showDiag = sp?.diag === 'ttp'
  return (
    <>
      <SettingsContent />
      {showDiag && (
        <div className="px-4 md:px-8">
          <TapToPayDiagnosticsPanel />
        </div>
      )}
    </>
  )
}
