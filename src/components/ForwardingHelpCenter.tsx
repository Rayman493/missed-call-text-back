'use client'

import { useState } from 'react'
import { Phone, Copy, ChevronDown, ChevronUp, Check, AlertTriangle } from 'lucide-react'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatForDisplay, generateForwardingCode } from '@/utils/phone-formatting'

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
    answer: 'Use the disable code above to turn off forwarding immediately. Then dial the correct forwarding code with your ReplyFlow number.'
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
    question: 'What about personal callers like friends and family?',
    answer: 'Add personal numbers to Ignored Contacts in Settings. Their calls stay separate from Customers, and their voicemails appear in Personal Voicemail.'
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
    // Use window.open with _blank for Capacitor compatibility
    // Capacitor handles tel: URLs by opening the system dialer
    window.open(telUrl, '_blank')
  }

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  const selectedCarrierInfo = selectedCarrier ? CARRIER_INSTRUCTIONS[selectedCarrier] : undefined
  const disableCode = selectedCarrierInfo?.disableCode
    ? generateForwardingCode(selectedCarrierInfo.disableCode, twilioNumber)
    : null

  const getCarrierInstructions = () => {
    if (!selectedCarrierInfo) return null

    const dialCode = generateForwardingCode(selectedCarrierInfo.dialCode, twilioNumber)
    const showDialButton = !['ringcentral', 'grasshopper', 'google_voice', 'other'].includes(selectedCarrier)

    return (
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
            3
          </div>
          <h3 className="text-sm font-semibold text-foreground">Dial this code from your business phone</h3>
        </div>
        <div className="pl-7">
          <div className="p-3.5 sm:p-4 bg-muted/40 dark:bg-slate-800/40 border border-border/50 rounded-xl space-y-3">
            {/* Hero code — the exact thing to dial */}
            <div className="py-1.5 text-center">
              <code className="text-xl sm:text-2xl font-bold font-mono tracking-wide text-foreground tabular-nums break-all leading-snug">
                {dialCode}
              </code>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleCopyCode(dialCode)}
                className="h-10 flex-1 inline-flex items-center justify-center gap-1.5 px-3 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg text-xs font-medium transition-colors"
                title="Copy code"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedCode ? 'Copied' : 'Copy'}
              </button>
              {showDialButton && (
                <button
                  onClick={() => handleOpenDialer(dialCode)}
                  className="h-10 flex-1 inline-flex items-center justify-center gap-1.5 px-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-medium transition-colors shadow-sm"
                >
                  <Phone className="w-3.5 h-3.5" />
                  Dial
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground/80 text-center">
              After entering the code, press Call/Send.
            </p>
            {selectedCarrierInfo.notes && selectedCarrierInfo.notes !== 'Press Send/Call after entering the code' && (
              <p className="text-xs text-muted-foreground/80 text-center">{selectedCarrierInfo.notes}</p>
            )}
          </div>
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Mental model — what forwarding does, at a glance */}
      <p className="text-center text-[11px] sm:text-xs text-muted-foreground/70">
        Missed call <span className="text-primary/70 mx-0.5">→</span> Forwarded to ReplyFlow <span className="text-primary/70 mx-0.5">→</span> ReplyFlow answers
      </p>

      {/* 1. ReplyFlow number */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
            1
          </div>
          <h3 className="text-sm font-semibold text-foreground">Your ReplyFlow number</h3>
        </div>
        <p className="text-xs text-muted-foreground/80 pl-7">
          This is where your missed calls will go.
        </p>
        <div className="pl-7">
          <div className="inline-block px-3.5 py-2.5 bg-muted/40 dark:bg-slate-800/60 border border-border/50 rounded-lg">
            <code className="text-base sm:text-lg font-mono font-semibold text-foreground tracking-wide tabular-nums">
              {formattedTwilioNumber}
            </code>
          </div>
        </div>
      </section>

      {/* 2. Select carrier */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
            2
          </div>
          <h3 className="text-sm font-semibold text-foreground">Choose your carrier</h3>
        </div>
        <p className="text-xs text-muted-foreground/80 pl-7">
          We&apos;ll show the correct forwarding code for your phone provider.
        </p>
        <div className="pl-7">
          <select
            id="carrier"
            value={selectedCarrier}
            onChange={(e) => setSelectedCarrier(e.target.value)}
            className="w-full px-3 py-2.5 sm:py-2.5 text-sm bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 text-foreground transition-colors shadow-sm"
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

      {/* 3. Dial the forwarding code */}
      {selectedCarrier && getCarrierInstructions()}

      {/* Secondary help — demoted below the primary setup path */}
      <section className="space-y-2.5 sm:space-y-3 pt-2">
        <h3 className="text-sm font-semibold text-foreground">Need help?</h3>

        {/* Carrier voicemail warning — carrier voicemail can intercept missed
            calls before ReplyFlow; surfaced as a card so it can't be missed */}
        {selectedCarrier && (
          <div className="flex gap-2.5 sm:gap-3 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 p-3 sm:p-3.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1 min-w-0">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                Using carrier voicemail?
              </p>
              <p className="text-xs leading-relaxed text-amber-800/90 dark:text-amber-100/80">
                ReplyFlow needs to receive your missed calls before your carrier
                voicemail answers. If calls still go to voicemail after forwarding
                is enabled, you may need to disable or adjust your carrier&apos;s
                voicemail settings. ReplyFlow cannot change carrier voicemail
                settings for you.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {disableCode && (
            <button
              onClick={() => toggleSection('disableForwarding')}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 text-muted-foreground hover:text-foreground rounded-lg text-xs font-medium transition-colors"
              aria-expanded={expandedSection === 'disableForwarding'}
            >
              {expandedSection === 'disableForwarding' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Disable Call Forwarding
            </button>
          )}
          <button
            onClick={() => toggleSection('troubleshooting')}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted/80 text-foreground rounded-lg text-xs font-medium transition-colors"
            aria-expanded={expandedSection === 'troubleshooting'}
          >
            {expandedSection === 'troubleshooting' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Troubleshooting
          </button>
        </div>

        {expandedSection === 'disableForwarding' && disableCode && selectedCarrierInfo && (
          <div className="p-3 sm:p-4 bg-muted/20 border border-border/40 rounded-xl space-y-2 sm:space-y-3">
            <p className="text-xs text-muted-foreground/70">
              Save this code for when you need to disable call forwarding later.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-background border border-border/50 rounded-lg text-sm font-mono font-medium text-muted-foreground break-all tabular-nums">
                {disableCode}
              </code>
              <button
                onClick={() => handleCopyDisable(disableCode)}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 sm:px-3 sm:py-2.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg text-xs font-medium transition-colors"
                title="Copy code"
              >
                {copiedDisable ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedDisable ? 'Copied' : 'Copy'}
              </button>
            </div>
            {selectedCarrierInfo.disableNotes && <p className="text-xs text-muted-foreground/70">{selectedCarrierInfo.disableNotes}</p>}
          </div>
        )}

        {expandedSection === 'troubleshooting' && (
          <div className="p-3 sm:p-4 bg-muted/30 border border-border/60 rounded-lg text-xs text-muted-foreground/80 space-y-2">
            {FAQS.map((faq, idx) => (
              <div key={idx}>
                <p className="font-medium text-foreground">{faq.question}</p>
                <p className="mt-0.5">{faq.answer}</p>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  )
}
