'use client'

import React from 'react'
import Link from 'next/link'
import { Users, MessageSquare, Settings, Phone } from 'lucide-react'

export default function QuickActions() {
  const actions = [
    {
      title: 'View Leads',
      description: 'Manage captured leads',
      icon: Users,
      href: '/dashboard/leads',
      color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 border-blue-200 dark:border-blue-800'
    },
    {
      title: 'Manage Follow-Ups',
      description: 'Configure automated messages',
      icon: MessageSquare,
      href: '/dashboard/settings/follow-ups',
      color: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 border-green-200 dark:border-green-800'
    },
    {
      title: 'Settings',
      description: 'System configuration',
      icon: Settings,
      href: '/dashboard/settings',
      color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 border-purple-200 dark:border-purple-800'
    },
    {
      title: 'Test ReplyFlow',
      description: 'Verify system operation',
      icon: Phone,
      href: '/dashboard/test-setup',
      color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 border-amber-200 dark:border-amber-800'
    }
  ]

  return (
    <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Quick Actions</h3>
        <div className="text-xs text-muted-foreground">
          Essential tools
        </div>
      </div>

      {/* Desktop: Horizontal row */}
      <div className="hidden sm:grid sm:grid-cols-4 sm:gap-3">
        {actions.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${action.color}`}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-slate-800">
              <action.icon className="w-4 h-4" />
            </div>
            <div className="text-center">
              <p className="text-xs font-medium">{action.title}</p>
              <p className="text-xs opacity-75 mt-1">{action.description}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Mobile: 2x2 grid */}
      <div className="sm:hidden grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${action.color}`}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-slate-800">
              <action.icon className="w-4 h-4" />
            </div>
            <div className="text-center">
              <p className="text-xs font-medium">{action.title}</p>
              <p className="text-xs opacity-75 mt-1">{action.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
