'use client'

import SSRSafeNavbar from '@/components/SSRSafeNavbar'
import Footer from '@/components/Footer'
import Link from 'next/link'
import { useState } from 'react'
import { CheckCircle, MessageCircle, Users, Clock, ArrowRight } from 'lucide-react'


export default function DemoPage() {
  const [currentStep, setCurrentStep] = useState(1)

  const steps = [
    {
      number: 1,
      title: 'Missed Call',
      description: 'Customer calls your business but you can\'t answer',
      icon: MessageCircle,
      status: 'completed'
    },
    {
      number: 2,
      title: 'Automatic Text Reply',
      description: 'ReplyFlow instantly texts them back with your custom message',
      icon: MessageCircle,
      status: currentStep >= 2 ? 'completed' : 'active'
    },
    {
      number: 3,
      title: 'Lead Captured',
      description: 'Customer appears in your dashboard as a new lead',
      icon: Users,
      status: currentStep >= 3 ? 'completed' : 'active'
    },
    {
      number: 4,
      title: 'Follow-up Ready',
      description: 'If customer doesn\'t reply, ReplyFlow can send a follow-up automatically',
      icon: Clock,
      status: currentStep >= 4 ? 'completed' : 'active'
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900/30">
      <SSRSafeNavbar />
      
      {/* Hero Section */}
      <div className="bg-white dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              See ReplyFlow in action
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
              Watch how a missed call turns into an automatic text and a captured lead.
            </p>
          </div>
        </div>
      </div>

      {/* Demo Timeline */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="space-y-12">
          {steps.map((step, index) => (
            <div key={step.number} className="relative">
              {/* Connection Line */}
              {index < steps.length - 1 && (
                <div className="absolute left-8 top-8 w-0.5 h-16 bg-gray-300 dark:bg-gray-600"></div>
              )}
              
              {/* Step Card */}
              <div className={`relative flex items-start gap-6 ${
                step.status === 'completed' ? 'opacity-60' : ''
              }`}>
                {/* Step Number */}
                <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                  step.status === 'completed' 
                    ? 'bg-green-600 text-white' 
                    : step.status === 'active'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-300 dark:bg-gray-600 text-gray-500'
                }`}>
                  {step.status === 'completed' ? (
                    <CheckCircle className="w-6 h-6" />
                  ) : (
                    <span className="text-lg font-semibold">{step.number}</span>
                  )}
                </div>

                {/* Step Content */}
                <div className="flex-1">
                  <div className="bg-white dark:bg-gray-800/50 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700/50 p-6">
                    <div className="flex items-start gap-4 mb-4">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                        step.status === 'completed' 
                          ? 'bg-green-600 text-white' 
                          : step.status === 'active'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-300 dark:bg-gray-600 text-gray-500'
                      }`}>
                        <step.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className={`text-lg font-semibold mb-2 ${
                          step.status === 'completed' 
                            ? 'text-gray-500 dark:text-gray-400' 
                            : step.status === 'active'
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}>
                          {step.title}
                        </h3>
                        <p className={`text-gray-600 dark:text-gray-400 ${
                          step.status === 'completed' ? 'line-through' : ''
                        }`}>
                          {step.description}
                        </p>
                      </div>
                    </div>

                    {/* Step 2: SMS Visualization */}
                    {step.number === 2 && (
                      <div className="mt-4 space-y-3">
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            {/* Business Message */}
                            <div className="flex-1">
                              <div className="bg-blue-600 text-white rounded-lg p-3 max-w-xs">
                                <p className="text-sm font-medium">Business</p>
                                <p className="text-xs opacity-90">Hi, this is [Business Name]. Sorry we missed your call — how can we help? Reply STOP to opt out.</p>
                              </div>
                            </div>
                            {/* Customer Message */}
                            <div className="flex-1">
                              <div className="bg-gray-200 dark:bg-gray-700 rounded-lg p-3 max-w-xs">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Customer</p>
                                <p className="text-xs text-gray-600 dark:text-gray-400">Hi, I wanted to ask about pricing.</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Lead Card */}
                    {step.number === 3 && (
                      <div className="mt-4">
                        <div className="bg-white dark:bg-gray-800/50 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700/50 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                                <Users className="w-5 h-5 text-white" />
                              </div>
                              <div>
                                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">New Lead</h4>
                                <p className="text-sm text-gray-600 dark:text-gray-400">+1 (555) 123-4567</p>
                              </div>
                            </div>
                            <div className="text-xs px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                              Status: Needs response
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-white dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="text-center space-y-6">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Ready to capture your missed calls?
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              Start your 14-day free trial and never miss another customer call.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/onboarding"
                className="inline-flex items-center px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                Start 14-Day Free Trial
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center px-8 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold rounded-lg transition-colors"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
