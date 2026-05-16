'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'

interface SectionErrorBoundaryProps {
  children: ReactNode
  sectionName: string
}

interface SectionErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export default class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[SectionErrorBoundary] ${this.props.sectionName} crashed:`, error)
    console.error(`[SectionErrorBoundary] Error info:`, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-900/20 border border-red-900/40 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-red-100">
                {this.props.sectionName} crashed
              </p>
              <p className="text-xs text-red-300 mt-1">
                {this.state.error?.message || 'Unknown error'}
              </p>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
