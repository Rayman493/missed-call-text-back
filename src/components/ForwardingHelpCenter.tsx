'use client'

import React, { useState, useEffect } from 'react'
import { Phone, Copy, ChevronDown, ChevronUp, ExternalLink, Video, Check } from 'lucide-react'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatForDisplay, generateForwardingCode } from '@/utils/phone-formatting'
import Link from 'next/link'

// Carrier types and their specific forwarding instructions
// TESTED CARRIERS: Verizon (✓), AT&T (✓), T-Mobile (✓), Comcast (✓)
// UNTESTED CARRIERS: RingCentral, Grasshopper, Google Voice, Sprint, Spectrum, Cox, Frontier, Vonage, Ooma, Nextiva, 8x8
const CARRIER_INSTRUCTIONS: Record<string, { 
  dialCode: string; 
  notes?: string;
  disableCode?: string;
  disableNotes?: string;
  tested?: boolean;
}> = {
  verizon: {
    dialCode: '*71 {{TWILIO_NUMBER}}',
    notes: 'Press Send/Call after entering the code',
    disableCode: '*73',
    disableNotes: 'Press Send/Call to disable call forwarding',
    tested: true
  },
  att: {
    dialCode: '*004*{{TWILIO_NUMBER}}#',
    notes: 'Press Send/Call after entering the code',
    disableCode: '#004#',
    disableNotes: 'Press Send/Call to disable call forwarding',
    tested: true
  },
  tmobile: {
    dialCode: '**61*{{TWILIO_NUMBER}}#',
    notes: 'Press Send/Call after entering the code',
    disableCode: '#61#',
    disableNotes: 'Press Send/Call to disable call forwarding',
    tested: true
  },
  comcast: {
    dialCode: '*72 {{TWILIO_NUMBER}}',
    notes: 'Press Send/Call after entering the code',
    disableCode: '*73',
    disableNotes: 'Press Send/Call to disable call forwarding',
    tested: true
  },
  sprint: {
    dialCode: '*72 {{TWILIO_NUMBER}}',
    notes: 'Press Send/Call after entering the code. Note: Sprint may have merged with T-Mobile',
    disableCode: '*720',
    disableNotes: 'Press Send/Call to disable call forwarding',
    tested: false
  },
  spectrum: {
    dialCode: '*72 {{TWILIO_NUMBER}}',
    notes: 'Press Send/Call after entering the code',
    disableCode: '*73',
    disableNotes: 'Press Send/Call to disable call forwarding',
    tested: false
  },
  cox: {
    dialCode: '*72 {{TWILIO_NUMBER}}',
    notes: 'Press Send/Call after entering the code',
    disableCode: '*73',
    disableNotes: 'Press Send/Call to disable call forwarding',
    tested: false
  },
  frontier: {
    dialCode: '*72 {{TWILIO_NUMBER}}',
    notes: 'Press Send/Call after entering the code',
    disableCode: '*73',
    disableNotes: 'Press Send/Call to disable call forwarding',
    tested: false
  },
  vonage: {
    dialCode: '*72 {{TWILIO_NUMBER}}',
    notes: 'Press Send/Call after entering the code',
    disableCode: '*73',
    disableNotes: 'Press Send/Call to disable call forwarding',
    tested: false
  },
  ooma: {
    dialCode: '*72 {{TWILIO_NUMBER}}',
    notes: 'Press Send/Call after entering the code',
    disableCode: '*73',
    disableNotes: 'Press Send/Call to disable call forwarding',
    tested: false
  },
  ringcentral: {
    dialCode: 'Configure in RingCentral portal settings',
    notes: 'Go to Settings → Phone System → Call Forwarding',
    disableCode: 'Disable in RingCentral portal',
    disableNotes: 'Go to Settings → Phone System → Call Forwarding and turn off forwarding',
    tested: false
  },
  grasshopper: {
    dialCode: 'Configure in Grasshopper portal settings',
    notes: 'Go to Settings → Call Forwarding',
    disableCode: 'Disable in Grasshopper portal',
    disableNotes: 'Go to Settings → Call Forwarding and turn off forwarding',
    tested: false
  },
  nextiva: {
    dialCode: 'Configure in Nextiva portal settings',
    notes: 'Go to Features → Call Forwarding',
    disableCode: 'Disable in Nextiva portal',
    disableNotes: 'Go to Features → Call Forwarding and turn off forwarding',
    tested: false
  },
  '8x8': {
    dialCode: 'Configure in 8x8 portal settings',
    notes: 'Go to Account Manager → Call Forwarding',
    disableCode: 'Disable in 8x8 portal',
    disableNotes: 'Go to Account Manager → Call Forwarding and turn off forwarding',
    tested: false
  },
  google_voice: {
    dialCode: 'Configure in Google Voice settings',
    notes: 'Go to Settings → Calls → Call Forwarding and enable conditional forwarding',
    disableCode: 'Disable in Google Voice settings',
    disableNotes: 'Go to Settings → Calls → Call Forwarding and turn off forwarding',
    tested: false
  },
  other: {
    dialCode: 'Contact your phone provider',
    notes: 'Enable conditional call forwarding for missed calls',
    disableCode: 'Contact your phone provider',
    disableNotes: 'Ask your provider to disable conditional call forwarding',
    tested: false
  }
}

const CARRIER_OPTIONS = [
  { value: 'verizon', label: 'Verizon (Tested ✓)' },
  { value: 'att', label: 'AT&T (Tested ✓)' },
  { value: 'tmobile', label: 'T-Mobile (Tested ✓)' },
  { value: 'comcast', label: 'Comcast (Tested ✓)' },
  { value: 'sprint', label: 'Sprint' },
  { value: 'spectrum', label: 'Spectrum' },
  { value: 'cox', label: 'Cox' },
  { value: 'frontier', label: 'Frontier' },
  { value: 'vonage', label: 'Vonage' },
  { value: 'ooma', label: 'Ooma' },
  { value: 'ringcentral', label: 'RingCentral' },
  { value: 'grasshopper', label: 'Grasshopper' },
  { value: 'nextiva', label: 'Nextiva' },
  { value: '8x8', label: '8x8' },
  { value: 'google_voice', label: 'Google Voice' },
  { value: 'other', label: 'Other' }
]

interface FAQItem {
  question: string
  answer: string
}

const FAQS: FAQItem[] = [
  {
    question: 'What if I accidentally forward the wrong number?',
    answer: 'Use the disable code below to turn off forwarding immediately. Then dial the correct forwarding code with your ReplyFlow number.'
  },
  {
    question: 'Will my phone still ring normally?',
    answer: 'Yes! Conditional call forwarding only activates when you don\'t answer. Your phone will ring normally first.'
  },
  {
    question: 'How long does forwarding take to activate?',
    answer: 'Usually immediate. Some carriers may take a few minutes. If it doesn\'t work after 5 minutes, try restarting your phone.'
  },
  {
    question: 'Can I still receive calls when forwarding is enabled?',
    answer: 'Yes. Forwarding only activates when you miss a call. All answered calls go directly to you as normal.'
  },
  {
    question: 'What if I change my phone number?',
    answer: 'You\'ll need to set up forwarding again with your new number. Contact support if you need a new ReplyFlow number.'
  }
]

export default function ForwardingHelpCenter() {
  const { business } = useBusiness()
  const [selectedCarrier, setSelectedCarrier] = useState(business?.business_phone_carrier || '')
  const [copiedCode, setCopiedCode] = useState(false)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
  const [copiedNumber, setCopiedNumber] = useState(false)

  // Use business's dedicated Twilio number
  const twilioNumber = business?.twilio_phone_number || process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER || '+18336584303'
  const formattedTwilioNumber = formatForDisplay(twilioNumber)

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    } catch (error) {
      console.error('Failed to copy code:', error)
    }
  }

  const handleCopyNumber = async () => {
    try {
      await navigator.clipboard.writeText(twilioNumber)
      setCopiedNumber(true)
      setTimeout(() => setCopiedNumber(false), 2000)
    } catch (error) {
      console.error('Failed to copy number:', error)
    }
  }

  const handleOpenDialer = (dialCode: string) => {
    const encodedCode = dialCode.replace(/\*/g, '%2A').replace(/#/g, '%23')
    const telUrl = `tel:${encodedCode}`
    window.location.href = telUrl
  }

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  const getCarrierInstructions = () => {
    if (!selectedCarrier) return null
    const instructions = CARRIER_INSTRUCTIONS[selectedCarrier]
    if (!instructions) return null

    const dialCode = generateForwardingCode(instructions.dialCode, twilioNumber)
    const disableCode = instructions.disableCode ? generateForwardingCode(instructions.disableCode, twilioNumber) : null

    return (
      <div className="space-y-2">
        {/* Enable Forwarding - Compact Code Row */}
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-2">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-medium text-slate-300">Enable forwarding</span>
            <button
              onClick={() => handleCopyCode(dialCode)}
              className="p-1 hover:bg-slate-700 text-slate-400 rounded transition-colors"
              title="Copy code"
            >
              {copiedCode ? (
                <span className="text-green-400 text-xs font-medium">Copied!</span>
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono text-slate-200 flex-1 px-2 py-1 bg-slate-900/50 rounded">
              {dialCode}
            </code>
            {selectedCarrier !== 'ringcentral' && selectedCarrier !== 'grasshopper' && selectedCarrier !== 'google_voice' && selectedCarrier !== 'other' && (
              <button
                onClick={() => handleOpenDialer(dialCode)}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors flex items-center gap-1"
              >
                <Phone className="w-3 h-3" />
                Dial
              </button>
            )}
          </div>
          {instructions.notes && (
            <p className="text-xs text-slate-500 mt-1">{instructions.notes}</p>
          )}
        </div>

        {/* Disable Forwarding - Compact Code Row */}
        {disableCode && (
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-slate-300">Disable forwarding</span>
              <button
                onClick={() => handleCopyCode(disableCode)}
                className="p-1 hover:bg-slate-700 text-slate-400 rounded transition-colors"
                title="Copy code"
              >
                {copiedCode ? (
                  <span className="text-green-400 text-xs font-medium">Copied!</span>
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono text-slate-200 flex-1 px-2 py-1 bg-slate-900/50 rounded">
                {disableCode}
              </code>
            </div>
            {instructions.disableNotes && (
              <p className="text-xs text-slate-500 mt-1">{instructions.disableNotes}</p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Two-column layout on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Left Column: Forwarding Setup */}
        <div className="space-y-2">
          {/* ReplyFlow Number - Compact */}
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-2">
            <p className="text-xs text-slate-400 mb-1">Your ReplyFlow Number</p>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono text-slate-200">{formattedTwilioNumber}</code>
              <button
                onClick={handleCopyNumber}
                className="p-1 hover:bg-slate-700 text-slate-400 rounded transition-colors"
                title="Copy number"
              >
                {copiedNumber ? (
                  <span className="text-green-400 text-xs font-medium">Copied!</span>
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
          </div>

          {/* Carrier Selection - Compact */}
          <div>
            <label htmlFor="carrier" className="block text-xs font-medium text-slate-300 mb-1">
              Your Phone Carrier
            </label>
            <select
              id="carrier"
              value={selectedCarrier}
              onChange={(e) => setSelectedCarrier(e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm border border-slate-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-900/50 text-slate-200"
            >
              <option value="">Select your carrier</option>
              {CARRIER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Forwarding Codes */}
          {selectedCarrier && getCarrierInstructions()}
        </div>

        {/* Right Column: Testing & Help */}
        <div className="space-y-2">
          {/* Run Test Call - Compact Green Button */}
          <Link
            href="/dashboard/test-setup"
            className="flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
            Run Test Call
          </Link>

          {/* Watch Demo - Link-style */}
          <Link
            href="/demo"
            className="flex items-center justify-center gap-2 px-3 py-2 text-slate-400 hover:text-slate-200 text-xs font-medium rounded-lg transition-colors"
          >
            <Video className="w-3.5 h-3.5" />
            Watch Setup Demo
          </Link>

          {/* Troubleshooting - Collapsed by default */}
          <div className="border-t border-slate-700/50 pt-2">
            <button
              onClick={() => toggleSection('troubleshooting')}
              className="w-full flex items-center justify-between text-left py-1 text-xs font-medium text-slate-300 hover:text-slate-200"
            >
              Troubleshooting
              {expandedSection === 'troubleshooting' ? (
                <ChevronUp className="w-3 h-3 text-slate-500" />
              ) : (
                <ChevronDown className="w-3 h-3 text-slate-500" />
              )}
            </button>
            
            {expandedSection === 'troubleshooting' && (
              <div className="mt-2 space-y-1.5 text-xs text-slate-400">
                <p><strong className="text-slate-300">Calls not reaching ReplyFlow?</strong></p>
                <ul className="list-disc list-inside space-y-0.5 ml-2">
                  <li>Verify carrier forwarding settings</li>
                  <li>Confirm ReplyFlow number is accurate</li>
                  <li>Try restarting your phone</li>
                </ul>
                
                <p className="mt-1.5"><strong className="text-slate-300">Forwarding not activating?</strong></p>
                <ul className="list-disc list-inside space-y-0.5 ml-2">
                  <li>Ensure you pressed Send/Call</li>
                  <li>Listen for confirmation tone</li>
                  <li>Contact your carrier if needed</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
