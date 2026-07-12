'use client'

import { useState, useRef } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

interface ContactPreview {
  name: string | null
  phoneOriginal: string
  phoneNormalized: string
  status: 'valid' | 'duplicate' | 'invalid'
  reason: string
  selected: boolean
}

interface ImportStats {
  valid: number
  duplicate: number
  invalid: number
  total: number
}

interface ImportContactsModalProps {
  isOpen: boolean
  onClose: () => void
  onImportSuccess: (message: string) => void
}

export default function ImportContactsModal({ isOpen, onClose, onImportSuccess }: ImportContactsModalProps) {
  useBodyScrollLock(isOpen)
  const [activeTab, setActiveTab] = useState<'paste' | 'csv'>('paste')
  const [pasteContent, setPasteContent] = useState('')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ContactPreview[] | null>(null)
  const [stats, setStats] = useState<ImportStats | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const supabase = createBrowserClient()

  const handlePreview = async () => {
    setError('')
    setIsPreviewing(true)
    setPreview(null)
    setStats(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      let content = ''
      if (activeTab === 'paste') {
        if (!pasteContent.trim()) {
          throw new Error('Please enter phone numbers to import')
        }
        content = pasteContent
      } else {
        if (!csvFile) {
          throw new Error('Please select a CSV file')
        }
        content = await csvFile.text()
      }

      const response = await fetch('/api/ignored-contacts/import/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type: activeTab, content })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to preview contacts')
      }

      setPreview(data.contacts)
      setStats(data.stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview contacts')
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleImport = async () => {
    if (!preview) return

    setError('')
    setIsImporting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      const selectedContacts = preview.filter(c => c.selected && c.status === 'valid')

      if (selectedContacts.length === 0) {
        throw new Error('No valid contacts selected for import')
      }

      const response = await fetch('/api/ignored-contacts/import/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ contacts: selectedContacts })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import contacts')
      }

      // Build success message
      let successMessage = ''
      if (data.imported > 0 && data.skipped === 0) {
        successMessage = `${data.imported} contact${data.imported === 1 ? '' : 's'} added.`
      } else if (data.imported > 0 && data.skipped > 0) {
        successMessage = `${data.imported} added. ${data.skipped} already existed.`
      } else if (data.imported === 0 && data.skipped > 0) {
        successMessage = `${data.skipped} already existed.`
      } else {
        successMessage = 'No valid phone numbers found.'
      }

      onImportSuccess(successMessage)
      onClose()
      setPreview(null)
      setStats(null)
      setPasteContent('')
      setCsvFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import contacts')
    } finally {
      setIsImporting(false)
    }
  }

  const handleToggleContact = (index: number) => {
    if (!preview) return
    const updated = [...preview]
    if (updated[index].status === 'valid') {
      updated[index].selected = !updated[index].selected
      setPreview(updated)
    }
  }

  const handleToggleAll = () => {
    if (!preview) return
    const allSelected = preview.filter(c => c.status === 'valid').every(c => c.selected)
    const updated = preview.map(c => {
      if (c.status === 'valid') {
        return { ...c, selected: !allSelected }
      }
      return c
    })
    setPreview(updated)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    if (file && file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      setError('Please select a CSV file')
      setCsvFile(null)
      return
    }
    setCsvFile(file)
    setError('')
  }

  const handleClose = () => {
    setPreview(null)
    setStats(null)
    setPasteContent('')
    setCsvFile(null)
    setError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[calc(100dvh-2rem)] md:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-700 shrink-0">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-white">Import Contacts</h2>
            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setActiveTab('paste')
                setPreview(null)
                setStats(null)
                setError('')
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'paste'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Paste Numbers
            </button>
            <button
              onClick={() => {
                setActiveTab('csv')
                setPreview(null)
                setStats(null)
                setError('')
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'csv'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Upload CSV
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1" style={{ maxHeight: 'calc(100dvh-10rem)' }}>
          {!preview ? (
            <div className="space-y-4">
              {activeTab === 'paste' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Paste phone numbers (one per line, optional "Name, Phone" format)
                  </label>
                  <textarea
                    value={pasteContent}
                    onChange={(e) => setPasteContent(e.target.value)}
                    placeholder="John Doe, +14125551234&#10;+14125555678&#10;Jane Smith, 4155559012"
                    className="w-full h-64 px-4 py-3 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-700 text-white resize-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Upload CSV file
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="w-full px-4 py-3 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-700 text-white"
                  />
                  {csvFile && (
                    <p className="mt-2 text-sm text-slate-400">
                      Selected: {csvFile.name}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-slate-400">
                    CSV should contain columns like: name, phone, phone_number, mobile, or number
                  </p>
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-200">
                  {error}
                </div>
              )}

              <button
                onClick={handlePreview}
                disabled={isPreviewing}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {isPreviewing ? 'Previewing...' : 'Preview'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {stats && (
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="p-4 bg-slate-700 rounded-lg">
                    <div className="text-2xl font-bold text-white">{stats.total}</div>
                    <div className="text-sm text-slate-400">Total</div>
                  </div>
                  <div className="p-4 bg-green-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-green-400">{stats.valid}</div>
                    <div className="text-sm text-green-300">Valid</div>
                  </div>
                  <div className="p-4 bg-yellow-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-400">{stats.duplicate}</div>
                    <div className="text-sm text-yellow-300">Duplicates</div>
                  </div>
                  <div className="p-4 bg-red-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-red-400">{stats.invalid}</div>
                    <div className="text-sm text-red-300">Invalid</div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preview?.filter(c => c.status === 'valid').every(c => c.selected)}
                    onChange={handleToggleAll}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-slate-300">Select All Valid</span>
                </label>
                <button
                  onClick={() => {
                    setPreview(null)
                    setStats(null)
                    setError('')
                  }}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  Back
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-700 rounded-lg">
                <table className="w-full">
                  <thead className="bg-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Select
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Original Phone
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Normalized Phone
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-slate-800 divide-y divide-slate-700">
                    {preview.map((contact, index) => (
                      <tr key={index} className="hover:bg-slate-700/50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={contact.selected}
                            onChange={() => handleToggleContact(index)}
                            disabled={contact.status !== 'valid'}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-white">
                          {contact.name || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-400">
                          {contact.phoneOriginal}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-400">
                          {contact.phoneNormalized}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            contact.status === 'valid'
                              ? 'bg-green-900/30 text-green-400'
                              : contact.status === 'duplicate'
                              ? 'bg-yellow-900/30 text-yellow-400'
                              : 'bg-red-900/30 text-red-400'
                          }`}>
                            {contact.status}
                          </span>
                          {contact.reason && (
                            <span className="ml-2 text-xs text-slate-400">
                              ({contact.reason})
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error && (
                <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-200">
                  {error}
                </div>
              )}

              <button
                onClick={handleImport}
                disabled={isImporting || !preview?.some(c => c.selected && c.status === 'valid')}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {isImporting ? 'Importing...' : `Import ${preview?.filter(c => c.selected && c.status === 'valid').length || 0} Contacts`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
