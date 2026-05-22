'use client'

import { useState } from 'react'
import { Business } from '@/lib/types'

interface TestCallFlowModalProps {
  isOpen: boolean
  onClose: () => void
  business: Business
  onTestCompleted: () => void
}

export default function TestCallFlowModal({ isOpen, onClose, business, onTestCompleted }: TestCallFlowModalProps) {
  const [testCompleted, setTestCompleted] = useState(false)

  if (!isOpen) return null

  const handleTestCompleted = () => {
    setTestCompleted(true)
    onTestCompleted()
    onClose()
  }

  const getForwardingStatusText = () => {
    // Not Set Up (Red) - Only if no business phone, no setup completion, or forwarding disabled
    if (!business.business_phone_number || !business.phone_setup_completed_at || !business.call_forwarding_enabled) {
      return 'Not Set Up'
    } 
    // Verified Working (Green) - If forwarding_verified is true
    else if (business.forwarding_verified) {
      return 'Forwarding Connected'
    } 
    // Set Up / Awaiting Test (Yellow) - Phone setup completed, forwarding enabled, but not verified
    else {
      return 'Pending Test'
    }
  }

  const getForwardingStatusColor = () => {
    // Not Set Up (Red)
    if (!business.business_phone_number || !business.phone_setup_completed_at || !business.call_forwarding_enabled) {
      return 'text-red-400'
    } 
    // Verified Working (Green)
    else if (business.forwarding_verified) {
      return 'text-green-400'
    } 
    // Configured / Awaiting Test (Yellow)
    else {
      return 'text-yellow-400'
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-2xl font-bold text-foreground">Test Your Missed-Call Flow</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-6">
            {/* Business Details */}
            <div className="bg-muted rounded-lg p-4">
              <h3 className="text-lg font-semibold text-foreground mb-3">Your Business Details</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Business Phone:</span>
                  <span className="text-foreground font-mono">{business.business_phone_number || 'Not set'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">ReplyFlow Number:</span>
                  <span className="text-foreground font-mono">{business.twilio_phone_number || 'Not assigned'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Forwarding Status:</span>
                  <span className={`font-medium ${getForwardingStatusColor()}`}>
                    {getForwardingStatusText()}
                  </span>
                </div>
              </div>
            </div>

            {/* Test Instructions */}
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-3">Test Instructions</h3>
              <ol className="space-y-3 text-muted-foreground">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-slate-600 text-white rounded-full flex items-center justify-center text-sm font-medium">1</span>
                  <span>Have someone call your business phone number.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-slate-600 text-white rounded-full flex items-center justify-center text-sm font-medium">2</span>
                  <span>Do not answer the call.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-slate-600 text-white rounded-full flex items-center justify-center text-sm font-medium">3</span>
                  <span>Wait for it to forward to ReplyFlow.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-slate-600 text-white rounded-full flex items-center justify-center text-sm font-medium">4</span>
                  <span>Confirm the caller hears the missed-call message.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-slate-600 text-white rounded-full flex items-center justify-center text-sm font-medium">5</span>
                  <span>Confirm they receive the auto-reply text message.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-slate-600 text-white rounded-full flex items-center justify-center text-sm font-medium">6</span>
                  <span>Refresh the dashboard to confirm the lead appears.</span>
                </li>
              </ol>
            </div>

            {/* Important Notes */}
            <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-yellow-400 mb-2">Important Notes</h3>
              <ul className="space-y-1 text-yellow-200 text-sm">
                <li>Make sure your phone is forwarded to your ReplyFlow number.</li>
                <li>The test caller should not answer the forwarded call.</li>
                <li>Auto-reply texts may take a few seconds to arrive.</li>
                <li>Check your spam folder if you don't receive the text.</li>
              </ul>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-8">
            <button
              onClick={handleTestCompleted}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              I Completed the Test
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
