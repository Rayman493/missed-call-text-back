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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <SSRSafeNavbar forceDark={true} />
      
      {/* Hero Section */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-3">
              See ReplyFlow in action
            </h1>
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Watch how a missed call turns into an automatic text and a captured lead.
            </p>
          </div>
        </div>
      </div>

      {/* Demo Timeline */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="space-y-8">
          {steps.map((step, index) => (
            <div key={step.number} className="relative">
              {/* Connection Line */}
              {index < steps.length - 1 && (
                <div className="absolute left-6 top-6 w-0.5 h-12 bg-slate-300 dark:bg-slate-600"></div>
              )}
              
              {/* Step Card */}
              <div className={`relative flex items-start gap-4 ${
                step.status === 'completed' ? 'opacity-60' : ''
              }`}>
                {/* Step Number */}
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  step.status === 'completed' 
                    ? 'bg-green-600 text-white' 
                    : step.status === 'active'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-300 dark:bg-slate-600 text-slate-500'
                }`}>
                  {step.status === 'completed' ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <span className="text-base font-semibold">{step.number}</span>
                  )}
                </div>

                {/* Step Content */}
                <div className="flex-1">
                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                        step.status === 'completed' 
                          ? 'bg-green-600 text-white' 
                          : step.status === 'active'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-300 dark:bg-slate-600 text-slate-500'
                      }`}>
                        <step.icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <h3 className={`text-base font-semibold mb-1 ${
                          step.status === 'completed' 
                            ? 'text-slate-500 dark:text-slate-400' 
                            : step.status === 'active'
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-900 dark:text-white'
                        }`}>
                          {step.title}
                        </h3>
                        <p className={`text-sm text-slate-600 dark:text-slate-400 ${
                          step.status === 'completed' ? 'line-through' : ''
                        }`}>
                          {step.description}
                        </p>
                      </div>
                    </div>

                    {/* Step 2: SMS Visualization */}
                    {step.number === 2 && (
                      <div className="mt-3 space-y-2">
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                          <div className="flex flex-col sm:flex-row gap-3">
                            {/* Business Message */}
                            <div className="flex-1">
                              <div className="bg-blue-600 text-white rounded-lg p-3 max-w-xs">
                                <p className="text-xs font-medium mb-1">Business</p>
                                <p className="text-xs opacity-90">Hi, this is Green Valley Lawn Care. Sorry we missed your call! We'd be happy to help. What size property are you looking to service?</p>
                              </div>
                            </div>
                            {/* Customer Message */}
                            <div className="flex-1">
                              <div className="bg-slate-200 dark:bg-slate-700 rounded-lg p-3 max-w-xs">
                                <p className="text-xs font-medium text-slate-900 dark:text-white mb-1">Customer</p>
                                <p className="text-xs text-slate-600 dark:text-slate-400">Hi, I was calling about lawn service pricing for my quarter-acre lot.</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Lead Card */}
                    {step.number === 3 && (
                      <div className="mt-3">
                        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                                <Users className="w-4 h-4 text-white" />
                              </div>
                              <div>
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">New Lead</h4>
                                <p className="text-xs text-slate-600 dark:text-slate-400">+1 (555) 123-4567</p>
                              </div>
                            </div>
                            <div className="text-xs px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                              Needs response
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

      {/* Value Props */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 text-center">
            <div className="text-2xl mb-2">🎯</div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">Capture leads automatically</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 text-center">
            <div className="text-2xl mb-2">⚡</div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">Respond instantly to missed calls</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 text-center">
            <div className="text-2xl mb-2">🕐</div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">Works while you're busy or after hours</p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">
              Ready to capture your missed calls?
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Start your 14-day free trial and never miss another customer call.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <Link
                href="/onboarding"
                className="inline-flex items-center h-11 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-sm hover:shadow-md hover:-translate-y-[1px] transition-all"
              >
                Start 14-Day Free Trial
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center h-11 px-6 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold rounded-lg transition-colors shadow-sm hover:shadow-md"
              >
                Back to Dashboard
              </Link>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
              Setup takes just a few minutes • No contracts • 14-day free trial
            </p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
