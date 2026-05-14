'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun, Monitor } from 'lucide-react'
import { useState, useEffect } from 'react'

export default function ThemeSelector() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="grid grid-cols-3 gap-1">
        <div className="w-full h-6 rounded bg-gray-200 dark:bg-slate-700 animate-pulse"></div>
        <div className="w-full h-6 rounded bg-gray-200 dark:bg-slate-700 animate-pulse"></div>
        <div className="w-full h-6 rounded bg-gray-200 dark:bg-slate-700 animate-pulse"></div>
      </div>
    )
  }

  const themes = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-1">
      {themes.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
            theme === value
              ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-700'
          }`}
          title={`Switch to ${label} theme`}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="sm:hidden">{label}</span>
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}
