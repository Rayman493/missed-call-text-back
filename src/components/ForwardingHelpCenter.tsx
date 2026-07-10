'use client'

import { useState } from 'react'
import { Phone, Copy, ChevronDown, ChevronUp, Video, Check } from 'lucide-react'
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

interface ForwardingHelpCenterProps {
  phoneNumber?: string
}

export default function ForwardingHelpCenter({ phoneNumber }: ForwardingHelpCenterProps) {
  const { business } = useBusiness()
  const [selectedCarrier, setSelectedCarrier] = useState(business?.business_phone_carrier || '')
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedDisable, setCopiedDisable] = useState(false)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
  const [copiedNumber, setCopiedNumber] = useState(false)

  // Use business's dedicated Twilio number, fallback to prop
  const twilioNumber = phoneNumber || business?.twilio_phone_number || process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER || '+18336584303'
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

  const handleCopyDisable = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedDisable(true)
      setTimeout(() => setCopiedDisable(false), 2000)
    } catch (error) {
      console.error('Failed to copy disable code:', error)
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
      <section className="space-y-4">
        {/* Enable forwarding */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-semibold">
              3
            </div>
            <h3 className="text-sm font-semibold text-foreground">Enable forwarding</h3>
          </div>
          <div className="pl-7">
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
              <p className="text-xs text-muted-foreground">
                Dial this code from your business phone, then press Send/Call.
              </p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <code className="w-full sm:flex-1 px-4 py-3 bg-background border border-border/50 rounded-lg text-sm font-mono font-semibold text-foreground break-all tabular-nums">
                  {dialCode}
                </code>
                <div className="flex sm:flex-1 gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => handleCopyCode(dialCode)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg text-xs font-medium transition-colors flex-1 sm:flex-none"
                    title="Copy code"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCode ? 'Copied' : 'Copy'}
                  </button>
                  {selectedCarrier !== 'ringcentral' && selectedCarrier !== 'grasshopper' && selectedCarrier !== 'google_voice' && selectedCarrier !== 'other' && (
                    <button
                      onClick={() => handleOpenDialer(dialCode)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-medium transition-colors shadow-sm flex-1 sm:flex-none"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      Dial
                    </button>
                  )}
                </div>
              </div>
              {instructions.notes && <p className="text-xs text-muted-foreground">{instructions.notes}</p>}
            </div>
          </div>
        </div>

        {/* Disable forwarding */}
        {disableCode && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs font-semibold">
                4
              </div>
              <h3 className="text-sm font-semibold text-foreground">Disable forwarding</h3>
            </div>
            <div className="pl-7">
              <div className="p-4 bg-muted/30 border border-border/50 rounded-xl space-y-3">
                <p className="text-xs text-muted-foreground">
                  Save this code in case you ever need to turn forwarding off.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-4 py-3 bg-background border border-border/50 rounded-lg text-sm font-mono font-semibold text-foreground break-all tabular-nums">
                    {disableCode}
                  </code>
                  <button
                    onClick={() => handleCopyDisable(disableCode)}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg text-xs font-medium transition-colors"
                    title="Copy code"
                  >
                    {copiedDisable ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedDisable ? 'Copied' : 'Copy'}
                  </button>
                </div>
                {instructions.disableNotes && <p className="text-xs text-muted-foreground">{instructions.disableNotes}</p>}
              </div>
            </div>
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="space-y-4">
      {/* 1. ReplyFlow number */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-semibold">
            1
          </div>
          <h3 className="text-sm font-semibold text-foreground">Your ReplyFlow number</h3>
        </div>
        <p className="text-xs text-muted-foreground pl-7">
          Calls forwarded here are handled by ReplyFlow.
        </p>
        <div className="pl-7">
          <div className="flex items-center gap-3 p-4 bg-muted/50 border border-border/50 rounded-xl">
            <code className="flex-1 text-base sm:text-lg font-mono font-semibold text-foreground tracking-wide tabular-nums">
              {formattedTwilioNumber}
            </code>
            <button
              onClick={handleCopyNumber}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg text-xs font-medium transition-colors"
              title="Copy number"
            >
              {copiedNumber ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedNumber ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </section>

      {/* 2. Select carrier */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-semibold">
            2
          </div>
          <h3 className="text-sm font-semibold text-foreground">Choose your carrier</h3>
        </div>
        <p className="text-xs text-muted-foreground pl-7">
          Select your phone provider to see the correct forwarding code.
        </p>
        <div className="pl-7">
          <select
            id="carrier"
            value={selectedCarrier}
            onChange={(e) => setSelectedCarrier(e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-muted/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 text-foreground transition-colors"
          >
            <option value="">Select your carrier</option>
            {CARRIER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* 3-4. Enable / disable forwarding */}
      {selectedCarrier && getCarrierInstructions()}

      {/* 5. Help and demo */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs font-semibold">
            ?
          </div>
          <h3 className="text-sm font-semibold text-foreground">Need help?</h3>
        </div>
        <div className="pl-7">
          <div className="flex flex-col sm:flex-row gap-2">
            <Link
              href="/demo"
              className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg text-xs font-medium transition-colors"
            >
              <Video className="w-3.5 h-3.5" />
              Watch Setup Demo
            </Link>
            <button
              onClick={() => toggleSection('troubleshooting')}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted/80 text-foreground rounded-lg text-xs font-medium transition-colors"
            >
              {expandedSection === 'troubleshooting' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Troubleshooting
            </button>
          </div>
          {expandedSection === 'troubleshooting' && (
            <div className="mt-2 p-4 bg-muted/30 border border-border/50 rounded-lg text-xs text-muted-foreground space-y-2">
              {FAQS.map((faq, idx) => (
                <div key={idx}>
                  <p className="font-medium text-foreground">{faq.question}</p>
                  <p className="mt-0.5">{faq.answer}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

    </div>
  )
}
