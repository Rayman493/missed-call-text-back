'use client'

import React, { useState } from 'react'
import { Phone, Copy, ChevronDown, ChevronUp, ExternalLink, Video } from 'lucide-react'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatForDisplay, generateForwardingCode } from '@/utils/phone-formatting'
import Link from 'next/link'

// Carrier types and their specific forwarding instructions
const CARRIER_INSTRUCTIONS: Record<string, { 
  dialCode: string; 
  notes?: string;
  disableCode?: string;
  disableNotes?: string;
}> = {
  verizon: {
    dialCode: '*71 {{TWILIO_NUMBER}}',
    notes: 'Press Send/Call after entering the code',
    disableCode: '*73',
    disableNotes: 'Press Send/Call to disable call forwarding'
  },
  att: {
    dialCode: '*004*{{TWILIO_NUMBER}}#',
    notes: 'Press Send/Call after entering the code',
    disableCode: '#004#',
    disableNotes: 'Press Send/Call to disable call forwarding'
  },
  tmobile: {
    dialCode: '**61*{{TWILIO_NUMBER}}#',
    notes: 'Press Send/Call after entering the code',
    disableCode: '#61#',
    disableNotes: 'Press Send/Call to disable call forwarding'
  },
  comcast: {
    dialCode: '*72 {{TWILIO_NUMBER}}',
    notes: 'Press Send/Call after entering the code',
    disableCode: '*73',
    disableNotes: 'Press Send/Call to disable call forwarding'
  },
  ringcentral: {
    dialCode: 'Configure in RingCentral portal settings',
    notes: 'Go to Settings → Phone System → Call Forwarding',
    disableCode: 'Disable in RingCentral portal',
    disableNotes: 'Go to Settings → Phone System → Call Forwarding and turn off forwarding'
  },
  grasshopper: {
    dialCode: 'Configure in Grasshopper portal settings',
    notes: 'Go to Settings → Call Forwarding',
    disableCode: 'Disable in Grasshopper portal',
    disableNotes: 'Go to Settings → Call Forwarding and turn off forwarding'
  },
  google_voice: {
    dialCode: 'Configure in Google Voice settings',
    notes: 'Go to Settings → Calls → Call Forwarding and enable conditional forwarding',
    disableCode: 'Disable in Google Voice settings',
    disableNotes: 'Go to Settings → Calls → Call Forwarding and turn off forwarding'
  },
  other: {
    dialCode: 'Contact your phone provider',
    notes: 'Enable conditional call forwarding for missed calls',
    disableCode: 'Contact your phone provider',
    disableNotes: 'Ask your provider to disable conditional call forwarding'
  }
}

const CARRIER_OPTIONS = [
  { value: 'verizon', label: 'Verizon' },
  { value: 'att', label: 'AT&T' },
  { value: 'tmobile', label: 'T-Mobile' },
  { value: 'comcast', label: 'Comcast' },
  { value: 'ringcentral', label: 'RingCentral' },
  { value: 'grasshopper', label: 'Grasshopper' },
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
  const [expandedSection, setExpandedSection] = useState<string | null>('forwarding')
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
      <div className="space-y-4">
        {/* Enable Forwarding */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Enable Call Forwarding
          </h4>
          
          <div className="bg-white dark:bg-slate-900 rounded-lg p-3 mb-3 border border-blue-100 dark:border-blue-800">
            <p className="text-xs text-muted-foreground mb-2">Dial this from your business phone:</p>
            <div className="flex items-center gap-2">
              <code className="text-lg font-mono text-foreground flex-1 p-2 bg-slate-100 dark:bg-slate-800 rounded text-center">
                {dialCode}
              </code>
              <button
                onClick={() => handleCopyCode(dialCode)}
                className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-muted-foreground rounded transition-colors"
                title="Copy forwarding code"
              >
                {copiedCode ? (
                  <span className="text-green-600 dark:text-green-400 text-xs font-medium">Copied!</span>
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Forwarding to: {formattedTwilioNumber}
            </p>
          </div>
          
          {instructions.notes && (
            <p className="text-xs text-blue-900 dark:text-blue-100">{instructions.notes}</p>
          )}

          {selectedCarrier !== 'ringcentral' && selectedCarrier !== 'grasshopper' && selectedCarrier !== 'google_voice' && selectedCarrier !== 'other' && (
            <button
              onClick={() => handleOpenDialer(dialCode)}
              className="mt-3 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Phone className="w-3 h-3" />
              Open Dialer
            </button>
          )}
        </div>

        {/* Disable Forwarding */}
        {disableCode && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-3">
              Disable Call Forwarding
            </h4>
            
            <div className="bg-white dark:bg-slate-900 rounded-lg p-3 mb-3 border border-amber-100 dark:border-amber-800">
              <p className="text-xs text-muted-foreground mb-2">Dial this to disable forwarding:</p>
              <div className="flex items-center gap-2">
                <code className="text-lg font-mono text-foreground flex-1 p-2 bg-slate-100 dark:bg-slate-800 rounded text-center">
                  {disableCode}
                </code>
                <button
                  onClick={() => handleCopyCode(disableCode)}
                  className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-muted-foreground rounded transition-colors"
                  title="Copy disable code"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {instructions.disableNotes && (
              <p className="text-xs text-amber-900 dark:text-amber-100">{instructions.disableNotes}</p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Phone className="w-4 h-4 text-blue-600" />
          Call Forwarding Help
        </h3>
        <Link
          href="/setup/forwarding"
          className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
        >
          Full Setup
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* ReplyFlow Number */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 mb-4">
        <p className="text-xs text-muted-foreground mb-1">Your ReplyFlow Number</p>
        <div className="flex items-center justify-between">
          <code className="text-sm font-mono text-foreground">{formattedTwilioNumber}</code>
          <button
            onClick={handleCopyNumber}
            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
            title="Copy number"
          >
            {copiedNumber ? (
              <span className="text-green-600 dark:text-green-400 text-xs font-medium">Copied!</span>
            ) : (
              <Copy className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      {/* Carrier Selection */}
      <div className="mb-4">
        <label htmlFor="carrier" className="block text-xs font-medium text-foreground mb-2">
          Your Phone Carrier
        </label>
        <select
          id="carrier"
          value={selectedCarrier}
          onChange={(e) => setSelectedCarrier(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
        >
          <option value="">Select your carrier</option>
          {CARRIER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Collapsible Sections */}
      {selectedCarrier && getCarrierInstructions()}

      {/* Run Test Call Button */}
      <Link
        href="/dashboard/test-setup"
        className="mt-4 w-full px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        <Phone className="w-4 h-4" />
        Run Test Call Again
      </Link>

      {/* Watch Demo Link */}
      <Link
        href="/demo"
        className="mt-2 w-full px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-foreground text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        <Video className="w-4 h-4" />
        Watch Setup Demo
      </Link>

      {/* Troubleshooting Section */}
      <div className="mt-4 pt-4 border-t border-border">
        <button
          onClick={() => toggleSection('troubleshooting')}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="text-sm font-medium text-foreground">Troubleshooting</span>
          {expandedSection === 'troubleshooting' ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        
        {expandedSection === 'troubleshooting' && (
          <div className="mt-3 space-y-3">
            <div className="text-xs text-muted-foreground space-y-2">
              <p><strong className="text-foreground">Calls not reaching ReplyFlow?</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Verify carrier forwarding settings are correct</li>
                <li>Confirm the ReplyFlow number is accurate</li>
                <li>Try restarting your phone (some carriers require this)</li>
                <li>Wait 5-10 minutes for carrier changes to propagate</li>
              </ul>
              
              <p className="mt-3"><strong className="text-foreground">Forwarding not activating?</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Ensure you pressed Send/Call after entering the code</li>
                <li>Listen for confirmation tone from your carrier</li>
                <li>Contact your carrier if activation fails</li>
              </ul>

              <p className="mt-3"><strong className="text-foreground">Still having trouble?</strong></p>
              <p>Contact <a href="mailto:support@replyflowhq.com" className="text-blue-600 hover:underline">support@replyflowhq.com</a> for help.</p>
            </div>
          </div>
        )}
      </div>

      {/* FAQ Section */}
      <div className="mt-4 pt-4 border-t border-border">
        <button
          onClick={() => toggleSection('faq')}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="text-sm font-medium text-foreground">Common Questions</span>
          {expandedSection === 'faq' ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        
        {expandedSection === 'faq' && (
          <div className="mt-3 space-y-3">
            {FAQS.map((faq, index) => (
              <div key={index} className="border-b border-border last:border-b-0 pb-3 last:pb-0">
                <button
                  onClick={() => toggleSection(`faq-${index}`)}
                  className="w-full text-left text-sm font-medium text-foreground flex items-center justify-between"
                >
                  {faq.question}
                  {expandedSection === `faq-${index}` ? (
                    <ChevronUp className="w-3 h-3 text-muted-foreground flex-shrink-0 ml-2" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0 ml-2" />
                  )}
                </button>
                {expandedSection === `faq-${index}` && (
                  <p className="mt-2 text-xs text-muted-foreground">{faq.answer}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
