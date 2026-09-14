'use client'

import { useState, useRef } from 'react'
import { Upload, Trash2, Loader2, Image as ImageIcon } from 'lucide-react'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
const MAX_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB

// Map raw Supabase/storage errors to user-friendly messages.
// Never expose internal infrastructure errors (e.g. "Bucket not found") to customers.
function friendlyStorageError(err: any): string {
  const msg = (err?.message || err?.error || '').toLowerCase()
  if (msg.includes('bucket not found') || msg.includes('bucket does not exist')) {
    return 'Logo upload is temporarily unavailable. Please try again.'
  }
  if (msg.includes('not found') || msg.includes('404')) {
    return 'Logo upload is temporarily unavailable. Please try again.'
  }
  if (msg.includes('policy') || msg.includes('permission') || msg.includes('403') || msg.includes('unauthorized')) {
    return 'You do not have permission to upload a logo. Please contact support.'
  }
  if (msg.includes('413') || msg.includes('too large') || msg.includes('payload too large')) {
    return 'Logo file is too large. Please use a file under 2 MB.'
  }
  if (msg.includes('mime') || msg.includes('type') || msg.includes('format')) {
    return 'Unsupported file format. Please use PNG, JPG, or WebP.'
  }
  return 'Logo upload is temporarily unavailable. Please try again.'
}

interface BusinessLogoSettingsProps {
  businessId: string
  logoUrl: string | null
  onLogoChange: (url: string | null) => void
}

export default function BusinessLogoSettings({ businessId, logoUrl, onLogoChange }: BusinessLogoSettingsProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Please upload a PNG, JPG, or WebP image')
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError('Logo must be under 2 MB')
      return
    }

    setUploading(true)
    try {
      const { createBrowserClient } = await import('@/lib/supabase/browser')
      const supabase = createBrowserClient()

      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const filePath = `${businessId}/logo.${ext}`

      // Remove old logo files (any extension) by listing the folder
      const { data: existing } = await supabase.storage
        .from('business-logos')
        .list(businessId)
      if (existing && existing.length > 0) {
        const oldPaths = existing.map((f: { name: string }) => `${businessId}/${f.name}`)
        await supabase.storage.from('business-logos').remove(oldPaths)
      }

      const { error: uploadError } = await supabase.storage
        .from('business-logos')
        .upload(filePath, file, { contentType: file.type, upsert: true })
      if (uploadError) throw uploadError

      const { data: pub } = supabase.storage.from('business-logos').getPublicUrl(filePath)
      const publicUrl = pub.publicUrl + `?t=${Date.now()}` // cache-bust

      // Save to business record
      const { error: updateError } = await supabase
        .from('businesses')
        .update({ logo_url: publicUrl.split('?')[0] })
        .eq('id', businessId)
      if (updateError) throw updateError

      onLogoChange(publicUrl)
    } catch (err: any) {
      console.error('[BUSINESS LOGO] Upload error:', err)
      setError(friendlyStorageError(err))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    setError('')
    setUploading(true)
    try {
      const { createBrowserClient } = await import('@/lib/supabase/browser')
      const supabase = createBrowserClient()

      const { data: existing } = await supabase.storage
        .from('business-logos')
        .list(businessId)
      if (existing && existing.length > 0) {
        const oldPaths = existing.map((f: { name: string }) => `${businessId}/${f.name}`)
        await supabase.storage.from('business-logos').remove(oldPaths)
      }

      await supabase.from('businesses').update({ logo_url: null }).eq('id', businessId)
      onLogoChange(null)
    } catch (err: any) {
      console.error('[BUSINESS LOGO] Remove error:', err)
      setError(friendlyStorageError(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl section-border shadow-sm p-6 scroll-mt-[64px]">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">Business Logo</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">Used on quotes and invoices.</p>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
        {/* Preview */}
        <div className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden bg-slate-50 dark:bg-slate-800/30 flex-shrink-0">
          {logoUrl ? (
            <img src={logoUrl} alt="Business logo" className="w-full h-full object-contain" />
          ) : (
            <ImageIcon className="w-8 h-8 text-slate-300 dark:text-slate-600" />
          )}
        </div>

        {/* Actions */}
        <div className="flex-1 space-y-3">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {logoUrl ? 'Replace' : 'Upload Logo'}
            </button>
            {logoUrl && (
              <button
                onClick={handleRemove}
                disabled={uploading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            PNG, JPG, or WebP. Max 2 MB. Object-contain, no cropping.
          </p>
        </div>
      </div>
    </div>
  )
}
