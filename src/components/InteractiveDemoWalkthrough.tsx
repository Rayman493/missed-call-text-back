'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Phone,
  PhoneOff,
  Bot,
  User,
  Calendar,
  CreditCard,
  CheckCircle2,
  RefreshCcw,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  MessageCircle,
  Clock,
  MapPin,
  Wrench,
  FileText,
  AlertCircle,
  Sparkles,
  Send,
  Check
} from 'lucide-react'

const steps = [
  { id: 'incoming-call', label: 'Customer Calls', description: 'A customer reaches out while you\'re unavailable.' },
  { id: 'missed-call', label: 'You Miss the Call', description: 'ReplyFlow automatically detects the missed call.' },
  { id: 'ai-conversation', label: 'AI Captures the Lead', description: 'ReplyFlow answers immediately and gathers the information your team needs.' },
  { id: 'ai-summary', label: 'Lead Details Organized', description: 'Customer information is automatically organized into a clean lead profile.' },
  { id: 'lead-created', label: 'Lead Saved Automatically', description: 'Nothing is lost—even if nobody answered the phone.' },
  { id: 'sms-conversation', label: 'Customer Replies by Text', description: 'Customers can add or update information without another phone call.' },
  { id: 'schedule', label: 'Book the Job', description: 'Schedule the appointment directly from ReplyFlow.' },
  { id: 'payment', label: 'Get Paid', description: 'Send a payment request in seconds after the work is complete.' },
  { id: 'success', label: 'Another Job Captured', description: 'One missed call became a booked customer.' },
]

const stepTransition = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
  transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1
    }
  }
}

const itemVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }
  }
}

function RingPulse() {
  return (
    <div className="relative flex items-center justify-center">
      <span className="absolute inline-flex h-24 w-24 rounded-full bg-blue-400/20 animate-ping" />
      <span className="absolute inline-flex h-16 w-16 rounded-full bg-blue-400/30 animate-ping" style={{ animationDelay: '0.2s' }} />
      <div className="relative z-10 w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
        <Phone className="w-7 h-7 text-white animate-pulse" />
      </div>
    </div>
  )
}

function StepBadge({ number, color = 'blue' }: { number: number; color?: 'blue' | 'orange' | 'green' | 'purple' | 'emerald' }) {
  const colors = {
    blue: 'bg-blue-600',
    orange: 'bg-orange-600',
    green: 'bg-green-600',
    purple: 'bg-purple-600',
    emerald: 'bg-emerald-600',
  }
  return (
    <div className={`w-8 h-8 ${colors[color]} rounded-full flex items-center justify-center flex-shrink-0 shadow-sm`}>
      <span className="text-white text-sm font-bold">{number}</span>
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

function StepIncomingCall() {
  return (
    <div className="flex flex-col items-center justify-center py-10 sm:py-14">
      <RingPulse />
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-8 text-center"
      >
        <Card className="px-6 py-5 inline-block">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">John Smith</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">(555) 123-4567</p>
            </div>
          </div>
        </Card>
        <p className="mt-5 text-sm font-medium text-slate-600 dark:text-slate-400">Incoming call to Arctic Air HVAC</p>
      </motion.div>
    </div>
  )
}

function StepMissedCall() {
  return (
    <div className="flex flex-col items-center justify-center py-10 sm:py-14">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="relative"
      >
        <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
          <PhoneOff className="w-8 h-8 text-orange-600 dark:text-orange-400" />
        </div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-6 text-center"
      >
        <Card className="px-6 py-5 inline-block">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">John Smith</p>
              <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Missed call • 30 seconds ago</p>
            </div>
          </div>
        </Card>
        <p className="mt-5 text-sm font-medium text-slate-600 dark:text-slate-400">Call forwarded to ReplyFlow AI</p>
      </motion.div>
    </div>
  )
}

const aiMessages = [
  { sender: 'ai', text: 'Hi, this is Arctic Air HVAC. How can I help you today?' },
  { sender: 'caller', text: 'My AC is not cooling.' },
  { sender: 'ai', text: 'What is the service address?' },
  { sender: 'caller', text: '1234 Oak Street, Pittsburgh.' },
  { sender: 'ai', text: 'When would you like us to come by?' },
  { sender: 'caller', text: 'Anytime after 5 PM this week.' },
  { sender: 'ai', text: 'Perfect. I will pass this to the team. You will hear from us shortly.' },
]

function StepAIConversation() {
  return (
    <div className="py-2">
      <div className="flex items-center justify-center gap-6 mb-6">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center">
            <User className="w-6 h-6 text-slate-600 dark:text-slate-300" />
          </div>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">John Smith</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-8 h-0.5 bg-slate-200 dark:bg-slate-700" />
          <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
          <div className="w-8 h-0.5 bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
            <Bot className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">ReplyFlow AI</span>
        </div>
      </div>

      <div className="space-y-3 max-w-lg mx-auto">
        {aiMessages.map((msg, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: msg.sender === 'ai' ? -20 : 20, y: 10 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ delay: index * 0.35, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            className={`flex ${msg.sender === 'ai' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.sender === 'ai'
                  ? 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none'
                  : 'bg-blue-600 text-white rounded-br-none'
              }`}
            >
              {msg.text}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

const intakeFields = [
  { icon: User, label: 'Name', value: 'John Smith', color: 'text-blue-600' },
  { icon: Wrench, label: 'Service', value: 'AC not cooling', color: 'text-orange-600' },
  { icon: FileText, label: 'Details', value: 'Upstairs unit not cooling for two days.', color: 'text-slate-600' },
  { icon: MapPin, label: 'Address', value: '1234 Oak Street, Pittsburgh', color: 'text-purple-600' },
  { icon: AlertCircle, label: 'Desired Completion', value: 'As soon as possible', color: 'text-red-600' },
  { icon: Clock, label: 'Callback Time', value: 'Anytime after 5 PM', color: 'text-emerald-600' },
]

function StepAISummary() {
  return (
    <div className="py-2">
      <div className="max-w-md mx-auto">
        <Card className="p-5 bg-gradient-to-br from-purple-50/50 to-pink-50/50 dark:from-purple-900/10 dark:to-pink-900/10 border-purple-100 dark:border-purple-800">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">AI Intake Summary</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Extracted from the call</p>
            </div>
          </div>

          <div className="space-y-3">
            {intakeFields.map((field, index) => (
              <motion.div
                key={field.label}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.15, duration: 0.35 }}
                className="bg-white dark:bg-slate-800/80 rounded-lg p-3 border border-purple-100/50 dark:border-purple-800/50"
              >
                <div className="flex items-center gap-2 mb-1">
                  <field.icon className={`w-4 h-4 ${field.color}`} />
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {field.label}
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 pl-6">{field.value}</p>
              </motion.div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

function StepLeadCreated() {
  return (
    <div className="flex flex-col items-center justify-center py-2">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        <Card className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-green-900 dark:text-green-100">Lead Created</h3>
              <p className="text-xs text-green-700 dark:text-green-300">Ready for follow-up</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm py-2 border-b border-green-100 dark:border-green-800">
              <span className="text-green-700 dark:text-green-300">Status</span>
              <span className="font-semibold text-green-900 dark:text-green-100">New Lead</span>
            </div>
            <div className="flex justify-between items-center text-sm py-2 border-b border-green-100 dark:border-green-800">
              <span className="text-green-700 dark:text-green-300">Priority</span>
              <span className="font-semibold text-green-900 dark:text-green-100">High</span>
            </div>
            <div className="flex justify-between items-center text-sm py-2 border-b border-green-100 dark:border-green-800">
              <span className="text-green-700 dark:text-green-300">Customer</span>
              <span className="font-semibold text-green-900 dark:text-green-100">John Smith</span>
            </div>
            <div className="flex justify-between items-center text-sm py-2">
              <span className="text-green-700 dark:text-green-300">Source</span>
              <span className="font-semibold text-green-900 dark:text-green-100">AI Voice</span>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  )
}

const smsMessages = [
  { sender: 'business', text: 'Sorry we missed your call — this is Arctic Air HVAC. How can we help?' },
  { sender: 'customer', text: 'My upstairs AC is not cooling.' },
  { sender: 'business', text: 'Thanks. We will update your lead and have a technician reach out shortly.' },
]

function StepSMSConversation() {
  return (
    <div className="py-2 max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-5 px-1">
        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
          <MessageCircle className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">Arctic Air HVAC</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Texting John Smith</p>
        </div>
      </div>

      <div className="space-y-3">
        {smsMessages.map((msg, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: index * 0.5, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            className={`flex ${msg.sender === 'business' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.sender === 'business'
                  ? 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none'
                  : 'bg-blue-600 text-white rounded-br-none'
              }`}
            >
              {msg.text}
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8 }}
        className="mt-5 flex items-center gap-2 text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2 border border-green-200 dark:border-green-800"
      >
        <div className="w-2 h-2 bg-green-600 rounded-full" />
        Lead updated automatically with new details
      </motion.div>
    </div>
  )
}

function StepSchedule() {
  return (
    <div className="flex flex-col items-center justify-center py-2">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Appointment Scheduled</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">From the ReplyFlow dashboard</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex flex-col items-center justify-center text-white">
                <span className="text-[10px] font-bold uppercase">Sat</span>
                <span className="text-lg font-bold leading-none">15</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Saturday, 2:00 PM</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">AC repair at 1234 Oak Street</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2 border border-blue-200 dark:border-blue-800">
              <Check className="w-3.5 h-3.5" />
              Confirmation text sent to John Smith
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  )
}

function StepPayment() {
  return (
    <div className="flex flex-col items-center justify-center py-2">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Payment Request Sent</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Sent from the ReplyFlow dashboard</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm py-2 border-b border-slate-100 dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400">Customer</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">John Smith</span>
            </div>
            <div className="flex justify-between items-center text-sm py-2 border-b border-slate-100 dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400">Service</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">AC Repair</span>
            </div>
            <div className="flex justify-between items-center text-sm py-2">
              <span className="text-slate-500 dark:text-slate-400">Deposit</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">$150.00</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 rounded-lg px-3 py-2 border border-purple-200 dark:border-purple-800">
              <Send className="w-3.5 h-3.5" />
              Payment Request link sent to customer
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  )
}

function StepSuccess() {
  return (
    <div className="flex flex-col items-center justify-center py-10 sm:py-14 text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, type: 'spring', stiffness: 200 }}
        className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6"
      >
        <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-3">
          Never lose another missed call.
        </h3>
        <p className="text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          ReplyFlow automatically captures leads, keeps conversations organized, helps schedule jobs, and sends payment requests—all from one dashboard.
        </p>
      </motion.div>
    </div>
  )
}

function StepContent({ step }: { step: number }) {
  switch (step) {
    case 0: return <StepIncomingCall />
    case 1: return <StepMissedCall />
    case 2: return <StepAIConversation />
    case 3: return <StepAISummary />
    case 4: return <StepLeadCreated />
    case 5: return <StepSMSConversation />
    case 6: return <StepSchedule />
    case 7: return <StepPayment />
    case 8: return <StepSuccess />
    default: return null
  }
}

interface InteractiveDemoWalkthroughProps {
  compact?: boolean
  showHeader?: boolean
}

export default function InteractiveDemoWalkthrough({ compact = false, showHeader = true }: InteractiveDemoWalkthroughProps) {
  const [step, setStep] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)
  const [direction, setDirection] = useState(1)

  const goToStep = useCallback((newStep: number) => {
    setDirection(newStep > step ? 1 : -1)
    setStep(newStep)
  }, [step])

  const next = useCallback(() => {
    if (step < steps.length - 1) {
      setDirection(1)
      setStep(s => s + 1)
    }
  }, [step])

  const previous = useCallback(() => {
    if (step > 0) {
      setDirection(-1)
      setStep(s => s - 1)
    }
  }, [step])

  const restart = useCallback(() => {
    setDirection(-1)
    setStep(0)
  }, [])

  useEffect(() => {
    if (!autoPlay) return
    if (step === steps.length - 1) {
      setAutoPlay(false)
      return
    }
    const timer = setTimeout(() => {
      next()
    }, compact ? 5500 : 6500)
    return () => clearTimeout(timer)
  }, [autoPlay, step, next, compact])

  const isFirst = step === 0
  const isLast = step === steps.length - 1

  return (
    <div className="w-full">
      {/* Progress bar */}
      <div className={`${compact ? 'mb-4' : 'mb-6 sm:mb-8'}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Step {step + 1} of {steps.length}
          </span>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
            {steps[step].label}
          </span>
        </div>
        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-blue-600 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${((step + 1) / steps.length) * 100}%` }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          />
        </div>
      </div>

      {/* Step content */}
      <div className={`relative ${compact ? 'min-h-[300px] sm:min-h-[320px]' : 'min-h-[360px] sm:min-h-[400px]'}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -24 }}
            transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            className="w-full"
          >
            <Card className={`${compact ? 'p-4 sm:p-5 min-h-[300px] sm:min-h-[320px]' : 'p-5 sm:p-8 min-h-[360px] sm:min-h-[400px]'} flex flex-col`}>
              {showHeader && (
                <div className={`flex flex-col gap-1.5 ${compact ? 'mb-3' : 'mb-5 sm:mb-6'}`}>
                  <div className="flex items-center gap-3">
                    <StepBadge number={step + 1} color={step === 8 ? 'green' : 'blue'} />
                    <h2 className={`font-semibold text-slate-900 dark:text-white ${compact ? 'text-base sm:text-lg' : 'text-lg sm:text-xl'}`}>
                      {steps[step].label}
                    </h2>
                  </div>
                  <p className={`text-slate-600 dark:text-slate-400 ${compact ? 'text-xs sm:text-sm pl-11' : 'text-sm pl-11'}`}>
                    {steps[step].description}
                  </p>
                </div>
              )}
              <div className="flex-1 flex items-center justify-center">
                <StepContent step={step} />
              </div>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 ${compact ? 'mt-4 sm:mt-5' : 'mt-6 sm:mt-8'}`}>
        <div className="flex items-center gap-2">
          <button
            onClick={previous}
            disabled={isFirst}
            className={`inline-flex items-center gap-1.5 rounded-lg font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'}`}
            aria-label="Previous step"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <button
            onClick={restart}
            className={`inline-flex items-center gap-1.5 rounded-lg font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'}`}
            aria-label="Restart demo"
          >
            <RefreshCcw className="w-4 h-4" />
            Restart
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoPlay(!autoPlay)}
            className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors border ${
              autoPlay
                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800 dark:hover:bg-amber-900/30'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
            } ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'}`}
            aria-label={autoPlay ? 'Pause autoplay' : 'Start autoplay'}
          >
            {autoPlay ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {autoPlay ? 'Pause' : 'Play Demo'}
          </button>
          <button
            onClick={next}
            disabled={isLast}
            className={`inline-flex items-center gap-1.5 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm ${compact ? 'px-4 py-2 text-xs' : 'px-5 py-2.5 text-sm'}`}
            aria-label="Next step"
          >
            {isLast ? 'Done' : 'Next'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
