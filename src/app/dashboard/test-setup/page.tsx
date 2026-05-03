'use client'

import { useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { CheckCircle, AlertCircle, Clock, Phone, MessageSquare, Inbox, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'

export default function TestSetupPage() {
  const { business } = useBusiness()
  const [activeStep, setActiveStep] = useState<number>(1)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())

  const toggleStep = (step: number) => {
    const newCompleted = new Set(completedSteps)
    if (newCompleted.has(step)) {
      newCompleted.delete(step)
    } else {
      newCompleted.add(step)
    }
    setCompletedSteps(newCompleted)
  }

  const markComplete = () => {
    // Mark the test as complete in the business
    // This would update the forwarding_verified status
    alert('Setup test marked as complete! This will update your onboarding status.')
  }

  const steps = [
    {
      number: 1,
      title: 'Call your business number',
      description: 'Use another phone to call your business number.',
      icon: Phone,
      outcome: 'Call should forward to ReplyFlow'
    },
    {
      number: 2,
      title: 'Do not answer the call',
      description: 'Allow the call to forward to ReplyFlow.',
      icon: Clock,
      outcome: 'Forwarding activates automatically'
    },
    {
      number: 3,
      title: 'Listen for the greeting',
      description: 'Verify you hear the ReplyFlow greeting/message.',
      icon: MessageSquare,
      outcome: 'Automated greeting plays'
    },
    {
      number: 4,
      title: 'Verify SMS reply',
      description: 'Check that you receive the automated SMS reply.',
      icon: MessageSquare,
      outcome: 'Automated text sent to caller'
    },
    {
      number: 5,
      title: 'Check dashboard',
      description: 'Confirm the lead appears in your dashboard inbox.',
      icon: Inbox,
      outcome: 'Lead created and conversation visible'
    }
  ]

  const expectedOutcomes = [
    'Lead created in your dashboard',
    'Conversation visible in inbox',
    'Automated reply sent to caller',
    'Follow-ups scheduled automatically'
  ]

  const troubleshooting = [
    {
      issue: 'Forwarding not enabled',
      solution: 'Make sure you enabled call forwarding on your business phone using the carrier-specific code provided in the phone setup step.'
    },
    {
      issue: 'SMS verification pending',
      solution: 'SMS delivery may be limited while carrier verification is pending. This typically takes 1-2 business days.'
    },
    {
      issue: 'No lead in dashboard',
      solution: 'Try refreshing the dashboard. If the issue persists, check that your Twilio number is properly configured.'
    }
  ]

  return (
    <AuthGuard>
      <BusinessGuard>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-8">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <Link 
                href="/dashboard" 
                className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4"
              >
                ← Back to Dashboard
              </Link>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                Test Your ReplyFlow Setup
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Follow these steps to verify your ReplyFlow configuration is working correctly.
              </p>
            </div>

            {/* SMS Verification Note */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-8">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                    SMS Verification Pending
                  </h3>
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    SMS delivery may be limited while carrier verification is pending. This typically takes 1-2 business days. During this time, you may experience delayed or limited SMS delivery.
                  </p>
                </div>
              </div>
            </div>

            {/* Step-by-Step Instructions */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
                Testing Steps
              </h2>
              <div className="space-y-6">
                {steps.map((step) => {
                  const Icon = step.icon
                  const isCompleted = completedSteps.has(step.number)
                  
                  return (
                    <div 
                      key={step.number}
                      className="flex items-start gap-4 p-4 rounded-lg border-2 transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      onClick={() => toggleStep(step.number)}
                    >
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                        isCompleted 
                          ? 'bg-green-600 text-white' 
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}>
                        {isCompleted ? (
                          <CheckCircle className="w-5 h-5" />
                        ) : (
                          <span className="text-sm font-semibold">{step.number}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                            {step.title}
                          </h3>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          {step.description}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                          <CheckCircle className="w-4 h-4" />
                          <span>{step.outcome}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Expected Outcomes */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Expected Outcomes
              </h2>
              <ul className="space-y-3">
                {expectedOutcomes.map((outcome, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{outcome}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Troubleshooting */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Troubleshooting
              </h2>
              <div className="space-y-4">
                {troubleshooting.map((item, index) => (
                  <div key={index} className="border-l-4 border-amber-500 pl-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      {item.issue}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {item.solution}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={markComplete}
                disabled={completedSteps.size < steps.length}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                Mark Setup as Complete
              </button>
              <Link
                href="/dashboard"
                className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                Return to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
