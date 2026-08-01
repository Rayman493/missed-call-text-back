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
  { id: 'ai-conversation', label: 'AI Handles the Intake', description: 'ReplyFlow answers as an AI receptionist and guides callers through a structured intake.' },
  { id: 'ai-summary', label: 'Lead Details Organized', description: 'Customer information is automatically organized into a clean lead profile.' },
  { id: 'lead-created', label: 'Lead Saved Automatically', description: 'Nothing is lost—even if nobody answered the phone.' },
  { id: 'sms-conversation', label: 'Customer Replies by Text', description: 'Customers can add or update information without another phone call.' },
  { id: 'schedule', label: 'Book the Job', description: 'Schedule the appointment directly from ReplyFlow.' },
  { id: 'payment', label: 'Get Paid Your Way', description: 'Accept Tap to Pay on iPhone or Android while you\'re on-site, or send a branded SMS payment request when you\'re done.' },
  { id: 'success', label: 'Another Job Captured', description: 'One missed call became a booked customer.' },
]

const stepTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { 
    duration: 0.3, 
    ease: [0.4, 0, 0.2, 1],
    times: [0, 1]
  }
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
      <span className="absolute inline-flex h-20 w-20 rounded-full bg-blue-400/15 animate-ping motion-reduce:animate-none" />
      <span className="absolute inline-flex h-14 w-14 rounded-full bg-blue-400/20 animate-ping motion-reduce:animate-none" style={{ animationDelay: '0.15s' }} />
      <div className="relative z-10 w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
        <Phone className="w-7 h-7 text-white animate-pulse motion-reduce:animate-none" />
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
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.3 }}
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
        transition={{ duration: 0.25 }}
        className="relative"
      >
        <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
          <PhoneOff className="w-8 h-8 text-orange-600 dark:text-orange-400" />
        </div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.25 }}
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
      </motion.div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.25 }}
        className="mt-5 text-sm font-medium text-slate-600 dark:text-slate-400"
      >
        Call forwarded to ReplyFlow AI
      </motion.p>
    </div>
  )
}

const intakeQuestions = [
  { label: 'Name', value: 'John Smith', icon: User },
  { label: 'Reason', value: 'AC not cooling', icon: Wrench },
  { label: 'Address', value: '1234 Oak Street', icon: MapPin },
  { label: 'Preferred Time', value: 'Tomorrow Afternoon', icon: Clock },
  { label: 'Callback', value: 'Anytime after 5 PM', icon: Phone },
]

function StepAIConversation() {
  return (
    <div className="py-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="max-w-md mx-auto"
      >
        <Card className="bg-gradient-to-br from-emerald-50/50 to-blue-50/50 dark:from-emerald-900/10 dark:to-blue-900/10 border-emerald-100 dark:border-emerald-800">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-3 p-4 border-b border-emerald-100/50 dark:border-emerald-800/50"
          >
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
              <Bot className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">ReplyFlow AI Receptionist</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Call Connected</p>
            </div>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
              className="ml-auto w-2 h-2 bg-green-500 rounded-full"
            />
          </motion.div>

          {/* Intake Fields */}
          <div className="p-4 space-y-2.5">
            {intakeQuestions.map((field, index) => (
              <motion.div
                key={field.label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + index * 0.12, duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-emerald-100/30 dark:border-emerald-800/30"
              >
                <field.icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {field.label}
                  </p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {field.value}
                  </p>
                </div>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.25 + index * 0.12, duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
                  className="w-5 h-5 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0"
                >
                  <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                </motion.div>
              </motion.div>
            ))}
          </div>

          {/* Footer Status */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.25 }}
            className="px-4 pb-4"
          >
            <div className="flex items-center justify-center gap-2 p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Intake Complete</span>
            </div>
          </motion.div>
        </Card>
      </motion.div>
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="max-w-md mx-auto"
      >
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
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
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
      </motion.div>
    </div>
  )
}

function StepLeadCreated() {
  return (
    <div className="flex flex-col items-center justify-center py-2">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm"
      >
        <Card className="p-4 sm:p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          {/* Header with status badge */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">John Smith</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">(555) 123-4567</p>
              </div>
            </div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.25 }}
              className="flex items-center gap-1.5"
            >
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">
                New Lead
              </span>
            </motion.div>
          </div>

          {/* Lead details */}
          <div className="space-y-3">
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Wrench className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Service</span>
              </div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">AC not cooling</p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Address</span>
              </div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">1234 Oak Street, Pittsburgh</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Completion</span>
                </div>
                <p className="text-xs font-medium text-slate-900 dark:text-white">As soon as possible</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Callback</span>
                </div>
                <p className="text-xs font-medium text-slate-900 dark:text-white">After 5 PM</p>
              </div>
            </div>
          </div>

          {/* Source indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.25 }}
            className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700"
          >
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Bot className="w-3.5 h-3.5" />
              <span>Captured by AI Voice</span>
            </div>
          </motion.div>
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="flex items-center gap-3 mb-5 px-1"
      >
        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
          <MessageCircle className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">Arctic Air HVAC</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Texting John Smith</p>
        </div>
      </motion.div>

      <div className="space-y-3">
        {smsMessages.map((msg, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: index * 0.25, duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
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
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0, duration: 0.25 }}
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
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
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
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.25 }}
              className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
            >
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex flex-col items-center justify-center text-white shadow-sm">
                <span className="text-[10px] font-bold uppercase">Sat</span>
                <span className="text-lg font-bold leading-none">15</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Saturday, 2:00 PM</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">AC repair at 1234 Oak Street</p>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.25 }}
              className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2 border border-blue-200 dark:border-blue-800"
            >
              <Check className="w-3.5 h-3.5" />
              Confirmation text sent to John Smith
            </motion.div>
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
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
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
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, duration: 0.25 }}
              className="flex justify-between items-center text-sm py-2 border-b border-slate-100 dark:border-slate-700"
            >
              <span className="text-slate-500 dark:text-slate-400">Customer</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">John Smith</span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.18, duration: 0.25 }}
              className="flex justify-between items-center text-sm py-2 border-b border-slate-100 dark:border-slate-700"
            >
              <span className="text-slate-500 dark:text-slate-400">Service</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">AC Repair</span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.26, duration: 0.25 }}
              className="flex justify-between items-center text-sm py-2"
            >
              <span className="text-slate-500 dark:text-slate-400">Deposit</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">$150.00</span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.25 }}
              className="flex items-center gap-2 text-xs text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 rounded-lg px-3 py-2 border border-purple-200 dark:border-purple-800"
            >
              <Send className="w-3.5 h-3.5" />
              Payment Request link sent to customer
            </motion.div>
          </div>
        </Card>
      </motion.div>
    </div>
  )
}

function StepSuccess() {
  const outcomes = [
    { text: 'Lead captured', delay: 0.25 },
    { text: 'Customer organized', delay: 0.35 },
    { text: 'Appointment booked', delay: 0.45 },
    { text: 'Payment requested', delay: 0.55 },
  ]

  return (
    <div className="flex flex-col items-center justify-center py-10 sm:py-14 text-center">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6"
      >
        <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-3">
          Never lose another missed call.
        </h3>
        <p className="text-slate-600 dark:text-slate-400 max-w-md mx-auto mb-6">
          ReplyFlow automatically captures leads, keeps conversations organized, helps schedule jobs, and sends payment requests—all from one dashboard.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.25 }}
        className="flex flex-col items-center gap-2 mb-6"
      >
        {outcomes.map((outcome, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: outcome.delay, duration: 0.2 }}
            className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"
          >
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            {outcome.text}
          </motion.div>
        ))}
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
  const [timerId, setTimerId] = useState<NodeJS.Timeout | null>(null)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  const goToStep = useCallback((newStep: number) => {
    setDirection(newStep > step ? 1 : -1)
    setStep(newStep)
    // Pause auto-play on manual interaction
    if (autoPlay) {
      setAutoPlay(false)
    }
  }, [step, autoPlay])

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
    // Pause auto-play on manual interaction
    if (autoPlay) {
      setAutoPlay(false)
    }
  }, [autoPlay])

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerId) {
        clearTimeout(timerId)
      }
    }
  }, [timerId])

  useEffect(() => {
    if (!autoPlay || prefersReducedMotion) return
    if (step === steps.length - 1) {
      setAutoPlay(false)
      return
    }
    // Prevent multiple timers
    if (timerId) {
      clearTimeout(timerId)
    }
    const newTimer = setTimeout(() => {
      next()
    }, compact ? 5500 : 6500)
    setTimerId(newTimer)
    return () => clearTimeout(newTimer)
  }, [autoPlay, step, next, compact, timerId, prefersReducedMotion])

  const isFirst = step === 0
  const isLast = step === steps.length - 1

  return (
    <div className="w-full">
      {/* Progress bar */}
      <div className={`${compact ? 'mb-4' : 'mb-6 sm:mb-8'}`} aria-live="polite" aria-atomic="true">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Step {step + 1} of {steps.length}
          </span>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
            {steps[step].label}
          </span>
        </div>
        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden relative" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={steps.length} aria-label={`Progress: step ${step + 1} of ${steps.length}`}>
          <motion.div
            className="h-full bg-blue-600 rounded-full motion-reduce:transition-none"
            initial={{ width: 0 }}
            animate={{ width: `${((step + 1) / steps.length) * 100}%` }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          />
          <motion.div
            className="absolute right-0 top-0 bottom-0 w-1 bg-white/30 rounded-r motion-reduce:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          />
        </div>
      </div>

      {/* Step content */}
      <div className={`relative ${compact ? 'min-h-[350px] sm:min-h-[380px]' : 'min-h-[400px] sm:min-h-[450px] md:min-h-[500px]'}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: direction * 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -20 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="w-full motion-reduce:transition-none motion-reduce:transform-none"
          >
            <Card className={`${compact ? 'p-4 sm:p-5 min-h-[350px] sm:min-h-[380px]' : 'p-5 sm:p-8 min-h-[400px] sm:min-h-[450px] md:min-h-[500px]'} flex flex-col`}>
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
            className={`inline-flex items-center justify-center gap-1.5 h-10 rounded-lg font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${compact ? 'px-3 text-xs' : 'px-4 text-sm'}`}
            aria-label="Previous step"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <button
            onClick={restart}
            className={`inline-flex items-center justify-center gap-1.5 h-10 rounded-lg font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.97] transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${compact ? 'px-3 text-xs' : 'px-4 text-sm'}`}
            aria-label="Restart demo"
          >
            <RefreshCcw className="w-4 h-4" />
            Restart
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => !prefersReducedMotion && setAutoPlay(!autoPlay)}
            disabled={prefersReducedMotion}
            className={`inline-flex items-center justify-center gap-1.5 h-10 rounded-lg font-medium transition-all border active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${
              autoPlay
                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800 dark:hover:bg-amber-900/30'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
            } ${compact ? 'px-3 text-xs' : 'px-4 text-sm'}`}
            aria-label={prefersReducedMotion ? 'Auto-play disabled due to motion preference' : (autoPlay ? 'Pause autoplay' : 'Start autoplay')}
          >
            {autoPlay ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {autoPlay ? 'Pause' : 'Play Demo'}
          </button>
          <button
            onClick={next}
            disabled={isLast}
            className={`inline-flex items-center justify-center gap-1.5 h-10 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 shadow-sm ${compact ? 'px-4 text-xs' : 'px-5 text-sm'}`}
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
