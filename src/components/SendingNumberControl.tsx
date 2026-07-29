'use client'

import { useState } from 'react'
import { MessageSquare, Smartphone, ChevronDown } from 'lucide-react'
import { useSendingSource, SendingSource } from '@/hooks/useSendingSource'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
} from '@radix-ui/react-dropdown-menu'
import { supportsBusinessNumber } from '@/lib/platform-capabilities'

interface SendingNumberControlProps {
  compact?: boolean
  showLabel?: boolean
}

export default function SendingNumberControl({ compact = false, showLabel = true }: SendingNumberControlProps) {
  const { sendingSource, isLoading, error, updateSendingSource } = useSendingSource()
  const [localError, setLocalError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const isNativeMobile = supportsBusinessNumber()

  const handleSourceChange = async (source: SendingSource) => {
    setLocalError(null)
    setIsOpen(false)
    try {
      await updateSendingSource(source)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to update sending number')
    }
  }

  if (compact) {
    // Compact segmented control version
    return (
      <div className="flex items-center gap-2">
        {showLabel && (
          <span className="text-xs text-slate-600 dark:text-slate-400">Sending from:</span>
        )}
        <div className="flex bg-slate-100 dark:bg-slate-900 rounded-md p-0.5">
          <button
            onClick={() => handleSourceChange('replyflow')}
            disabled={isLoading}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
              sendingSource === 'replyflow'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-foreground shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
            }`}
            aria-pressed={sendingSource === 'replyflow'}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            ReplyFlow
          </button>
          <button
            onClick={() => handleSourceChange('business')}
            disabled={isLoading}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
              sendingSource === 'business'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-foreground shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
            }`}
            aria-pressed={sendingSource === 'business'}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Business
          </button>
        </div>
        {isLoading && (
          <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        )}
        {(error || localError) && (
          <span className="text-xs text-red-600 dark:text-red-400">
            {error || localError}
          </span>
        )}
      </div>
    )
  }

  // Dropdown menu version
  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-sm font-medium text-slate-900 dark:text-foreground transition-colors disabled:opacity-50"
          disabled={isLoading}
        >
          {sendingSource === 'replyflow' ? (
            <>
              <MessageSquare className="w-4 h-4" />
              <span>ReplyFlow Number</span>
            </>
          ) : (
            <>
              <Smartphone className="w-4 h-4" />
              <span>Business Number</span>
            </>
          )}
          <ChevronDown className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          align="start"
          sideOffset={4}
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg min-w-[200px] p-1"
        >
          <DropdownMenuItem
            onClick={() => handleSourceChange('replyflow')}
            className={`flex items-center gap-2 px-3 py-2 rounded-sm text-sm cursor-pointer ${
              sendingSource === 'replyflow'
                ? 'bg-slate-100 dark:bg-slate-900'
                : 'hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>ReplyFlow Number</span>
            {sendingSource === 'replyflow' && (
              <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">Active</span>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleSourceChange('business')}
            disabled={!isNativeMobile}
            className={`flex items-center gap-2 px-3 py-2 rounded-sm text-sm cursor-pointer ${
              sendingSource === 'business'
                ? 'bg-slate-100 dark:bg-slate-900'
                : 'hover:bg-slate-50 dark:hover:bg-slate-700'
            } ${!isNativeMobile ? 'opacity-50' : ''}`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Business Number</span>
            {sendingSource === 'business' && (
              <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">Active</span>
            )}
          </DropdownMenuItem>
          {!isNativeMobile && (
            <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 mt-1">
              Business Number requires mobile device
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenuPortal>
      {(error || localError) && (
        <span className="text-xs text-red-600 dark:text-red-400 ml-2">
          {error || localError}
        </span>
      )}
    </DropdownMenu>
  )
}
