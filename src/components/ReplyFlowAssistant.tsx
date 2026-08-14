'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, MessageCircle, X, ChevronRight, ArrowRight, Clock, Calendar, BookOpen, Mail, Users, Calendar as CalendarIcon, CreditCard, Bot, TrendingUp, Settings as SettingsIcon, Shield } from 'lucide-react'
import {
  AssistantContext,
  AssistantArticle,
  SearchResult,
  KNOWLEDGE_BASE,
  DocumentationProvider,
  ReplyFlowAssistantEngine,
} from '@/lib/assistant'

export { type AssistantContext }

interface ReplyFlowAssistantProps {
  className?: string
  defaultCategory?: string
  context?: AssistantContext
  onClose?: () => void
  initialKbId?: string
}

const engine = new ReplyFlowAssistantEngine()
engine.registerProvider(
  new DocumentationProvider({
    articles: KNOWLEDGE_BASE,
    minScore: 6,
    minConfidence: 'medium',
    defaultLimit: 5,
  })
)

const documentationProvider = engine.getProvider('documentation') as DocumentationProvider

interface SuggestedPrompt {
  category: string
  icon: React.ReactNode
  prompts: string[]
}

// Prompts must exactly match KB article questions to ensure 1:1 mapping
const suggestedPrompts: SuggestedPrompt[] = [
  {
    category: 'Getting Started',
    icon: <BookOpen className="w-4 h-4" />,
    prompts: [
      'Setup checklist',
      'Forwarding basics',
      'Test your setup',
      'What is ReplyFlow?',
      'How ReplyFlow works'
    ]
  },
  {
    category: 'AI Receptionist',
    icon: <Bot className="w-4 h-4" />,
    prompts: [
      'How does AI Voice work?'
    ]
  },
  {
    category: 'Customers',
    icon: <Users className="w-4 h-4" />,
    prompts: [
      'Customers vs Leads',
      'How do I reply to a customer?',
      'What do lead statuses mean?'
    ]
  },
  {
    category: 'Appointments & Calendar',
    icon: <CalendarIcon className="w-4 h-4" />,
    prompts: [
      'How do I connect Google Calendar?',
      'How do I create an appointment?',
      'Why are events not showing?'
    ]
  },
  {
    category: 'Payments',
    icon: <CreditCard className="w-4 h-4" />,
    prompts: [
      'Payment Requests overview',
      'Create and send a Payment Request',
      'How do I connect Stripe?',
      'Set up Tap to Pay on iPhone'
    ]
  },
  {
    category: 'Business Settings',
    icon: <SettingsIcon className="w-4 h-4" />,
    prompts: [
      'How do I change business hours?',
      'How do follow-ups work?',
      'How do I delete my account?'
    ]
  },
  {
    category: 'Troubleshooting',
    icon: <Bot className="w-4 h-4" />,
    prompts: [
      'SMS did not send after missed call',
      'Call forwarding is not working',
      'Why didn\'t my test call work?',
      'No lead appeared after my test call',
      'Push notification missing'
    ]
  },
  {
    category: 'Billing',
    icon: <CreditCard className="w-4 h-4" />,
    prompts: [
      'Manage subscription (Stripe)',
      'Billing portal (how to use)',
      'Stripe says verification pending'
    ]
  },
  {
    category: 'Security & Privacy',
    icon: <Shield className="w-4 h-4" />,
    prompts: [
      'Is ReplyFlow TCPA compliant?'
    ]
  }
]

export default function ReplyFlowAssistant({ className = '', defaultCategory, context, onClose, initialKbId }: ReplyFlowAssistantProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedArticle, setSelectedArticle] = useState<AssistantArticle | null>(null)
  const [showResults, setShowResults] = useState(false)
  const [isAccountSpecific, setIsAccountSpecific] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [relatedQuestions, setRelatedQuestions] = useState<AssistantArticle[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const suggestedArticles = useMemo(
    () => documentationProvider.getSuggestedArticles(defaultCategory, context, 4),
    [defaultCategory, context]
  )

  // Auto-focus search input when assistant opens (desktop only to avoid keyboard on mobile).
  useEffect(() => {
    const isMobile = window.innerWidth < 768
    if (!isMobile) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [])

  // If an initialKbId is provided, directly open that article by ID
  useEffect(() => {
    if (!initialKbId) return
    const article = KNOWLEDGE_BASE.find(a => a.id === initialKbId)
    if (!article) return
    setSelectedArticle(article)
    setRelatedQuestions(documentationProvider.getRelatedArticles(article.id, 3))
    setShowResults(true)
    setQuery(article.question)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKbId])

  const reset = useCallback(() => {
    setQuery('')
    setResults([])
    setSelectedArticle(null)
    setShowResults(false)
    setIsAccountSpecific(false)
    setHasSearched(false)
    setSelectedIndex(-1)
    setRelatedQuestions([])
    const isMobile = window.innerWidth < 768
    if (!isMobile) {
      inputRef.current?.focus()
    }
  }, [])

  const performSearch = useCallback((searchQuery: string) => {
    const trimmed = searchQuery.trim()
    if (!trimmed) return

    setIsSearching(true)
    setShowResults(true)
    setSelectedArticle(null)
    scrollContainerRef.current?.scrollTo({ top: 0 })

    // Small delay to show loading state for better UX
    setTimeout(() => {
      const searchResults = engine.search(trimmed, context ?? {}, { limit: 5 })
      const isAccount = searchResults.length === 0 && documentationProvider.canAnswer(trimmed, context ?? {})

      setHasSearched(true)
      setIsAccountSpecific(isAccount)
      setResults(searchResults)
      setSelectedArticle(null)
      setSelectedIndex(searchResults.length > 0 ? 0 : -1)

      if (searchResults.length > 0) {
        setRelatedQuestions(
          documentationProvider.getRelatedArticles(searchResults[0].article.id, 3)
        )
      } else {
        setRelatedQuestions(suggestedArticles)
      }

      setIsSearching(false)
    }, 300)
  }, [context, suggestedArticles])

  const handleSearch = () => performSearch(query)

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    inputRef.current?.blur()
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    handleSearch()
  }

  const handleSuggestedQuestion = (question: string) => {
    setQuery(question)
    inputRef.current?.blur()
    performSearch(question)
  }

  const handleResultClick = (article: AssistantArticle, index: number) => {
    setSelectedArticle(article)
    setSelectedIndex(index)
    setRelatedQuestions(documentationProvider.getRelatedArticles(article.id, 3))
    requestAnimationFrame(() => {
      scrollContainerRef.current?.scrollTo({ top: 0 })
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      inputRef.current?.blur()
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
      handleSearch()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose?.()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
      scrollSelectedIntoView()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, -1))
      scrollSelectedIntoView()
    }
  }

  const scrollSelectedIntoView = () => {
    // Defer so the DOM has updated
    setTimeout(() => {
      const el = resultsRef.current?.querySelector('[data-selected="true"]')
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 0)
  }

  // Highlight matched terms in a text snippet.
  const highlightText = (text: string, terms: string[]) => {
    if (!terms.length) return text
    const uniqueTerms = Array.from(new Set(terms.map(t => t.toLowerCase())))
    const pattern = new RegExp(`(${uniqueTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    const parts = text.split(pattern)
    return parts.map((part, i) =>
      pattern.test(part) ? (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/50 text-slate-900 dark:text-white rounded px-0.5">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      )
    )
  }

  const readingTimeLabel = (minutes?: number) => {
    if (!minutes) return null
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
        <Clock className="w-3 h-3" />
        {minutes} min read
      </span>
    )
  }

  const lastUpdatedLabel = (date?: string) => {
    if (!date) return null
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
        <Calendar className="w-3 h-3" />
        Updated {date}
      </span>
    )
  }

  // Reset internal scroll position whenever the assistant mounts so header is always visible
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
  }, [])

  return (
    <div data-rf-assistant-root className={`bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 w-full flex flex-col overflow-hidden min-h-0 ${className}`}>
      {/* Fixed header */}
      <div className="flex-shrink-0 z-30 bg-white/95 dark:bg-slate-800/95 backdrop-blur border-b border-slate-200/80 dark:border-slate-700/80 p-3 sm:p-4">
        {/* Header */}
        <div className="flex items-start gap-2.5 mb-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
            <MessageCircle className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white leading-tight">ReplyFlow Help</h3>
            {!showResults && (
              <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                Search documentation for answers about customers, appointments, payments, and more.
              </p>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex-shrink-0"
              aria-label="Close ReplyFlow Assistant"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSearchSubmit}>
          {/* Search Box */}
          <div className="relative mb-4">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              enterKeyHint="search"
              placeholder="Search guides and FAQs..."
              className="w-full pl-9 pr-9 py-2 sm:py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-300 dark:border-slate-500 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow text-xs sm:text-sm"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
            {query && (
              <button
                type="button"
                onClick={reset}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-md hover:bg-slate-200 dark:hover:bg-slate-600"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search Button - Desktop only */}
          <button
            type="submit"
            disabled={!query.trim()}
            className="hidden sm:block w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-sm hover:shadow disabled:shadow-none text-sm"
          >
            Ask ReplyFlow Assistant
          </button>
        </form>
      </div>

      {/* Scrollable Content */}
      <div 
        ref={scrollContainerRef} 
        className="flex-1 overflow-y-auto scrollbar-hide"
      >
        <style>{`
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
          .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        `}</style>
        <div className="p-3 sm:p-4 sm:pt-3">
        {/* Results */}
        {showResults && !selectedArticle && (
          <div className="mb-3 space-y-3" ref={resultsRef}>
            {/* Loading State */}
            {isSearching && (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm">Searching documentation...</span>
                </div>
              </div>
            )}

            {/* Account-specific fallback */}
            {!isSearching && isAccountSpecific && results.length === 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <p className="text-amber-800 dark:text-amber-200 text-sm mb-3">
                  This may require account-specific support. Here are some related troubleshooting steps:
                </p>
                {relatedQuestions.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {relatedQuestions.map(article => (
                      <button
                        key={article.id}
                        onClick={() => handleSuggestedQuestion(article.question)}
                        className="w-full text-left p-2 bg-white dark:bg-slate-600 hover:bg-slate-100 dark:hover:bg-slate-500 rounded-lg transition-colors flex items-center gap-2 group"
                      >
                        <ChevronRight className="w-4 h-4 text-amber-600 dark:text-amber-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0" />
                        <span className="text-sm text-amber-900 dark:text-amber-100 group-hover:text-slate-900 dark:group-hover:text-white">
                          {article.question}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-amber-800 dark:text-amber-200 text-sm">
                  For direct assistance, contact support at{' '}
                  <a href="https://mail.google.com/mail/?view=cm&fs=1&to=support@replyflowhq.com" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                    support@replyflowhq.com
                  </a>.
                </p>
              </div>
            )}

            {/* No results fallback */}
            {!isSearching && !isAccountSpecific && results.length === 0 && (
              <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 bg-slate-200 dark:bg-slate-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Search className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <div>
                    <p className="text-slate-900 dark:text-white font-medium mb-1">I couldn't find a reliable answer for that yet.</p>
                    <p className="text-slate-600 dark:text-slate-400 text-sm">
                      Try rephrasing your question, choose a related guide below, or contact ReplyFlow Support for help.
                    </p>
                  </div>
                </div>

                {/* Suggested related articles */}
                {relatedQuestions.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Related guides</p>
                    <div className="space-y-2">
                      {relatedQuestions.slice(0, 3).map((article) => (
                        <button
                          key={article.id}
                          onClick={() => handleSuggestedQuestion(article.question)}
                          className="w-full text-left p-2.5 bg-white dark:bg-slate-600 hover:bg-slate-100 dark:hover:bg-slate-500 rounded-lg transition-colors flex items-center gap-2 group"
                        >
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0" />
                          <span className="text-xs text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white">
                            {article.question}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => reset()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Search className="w-4 h-4" />
                    Try Different Keywords
                  </button>
                  <a
                    href="https://mail.google.com/mail/?view=cm&fs=1&to=support@replyflowhq.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-500 transition-colors"
                  >
                    <Mail className="w-4 h-4" />
                    Contact Support
                  </a>
                </div>
                {suggestedArticles.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Try these instead:</p>
                    <div className="space-y-2">
                      {suggestedArticles.map(article => (
                        <button
                          key={article.id}
                          onClick={() => handleSuggestedQuestion(article.question)}
                          className="w-full text-left p-2.5 bg-white dark:bg-slate-600 hover:bg-slate-100 dark:hover:bg-slate-500 rounded-lg transition-colors flex items-center gap-2 group"
                        >
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0" />
                          <span className="text-xs text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white">
                            {article.question}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Result list */}
            {!isSearching && results.length > 0 && (
              <div className="space-y-2">
                {results.map((result, index) => {
                  const isSelected = false
                  const isHighlighted = selectedIndex === index
                  return (
                    <button
                      key={result.article.id}
                      data-selected={isHighlighted}
                      onClick={() => handleResultClick(result.article, index)}
                      className={`w-full text-left rounded-lg border transition-all duration-200 p-3.5 ${
                        isSelected || isHighlighted
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                          {result.article.category}
                        </span>
                        <div className="flex items-center gap-2">
                          {readingTimeLabel(result.article.readingTime)}
                        </div>
                      </div>
                      <h4 className="font-semibold text-slate-900 dark:text-white mb-1 text-sm leading-snug">
                        {highlightText(result.article.question, result.matchedTerms)}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                        {highlightText(result.article.summary, result.matchedTerms)}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Selected article detail */}
        {showResults && selectedArticle && results.length > 0 && (
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
            <button
              onClick={() => {
                setSelectedArticle(null)
                requestAnimationFrame(() => {
                  scrollContainerRef.current?.scrollTo({ top: 0 })
                })
              }}
              className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mb-3 font-medium transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5 rotate-180" />
              Back to results
            </button>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                {selectedArticle.category}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">Source: {selectedArticle.source}</span>
            </div>
            <h4 className="font-semibold text-slate-900 dark:text-white mb-2 text-base leading-snug">{selectedArticle.question}</h4>

            {/* Short answer */}
            {selectedArticle.summary && (
              <div className="mb-3 p-3 rounded-md bg-white/70 dark:bg-slate-600/50 border border-slate-200 dark:border-slate-500">
                <p className="text-sm text-slate-800 dark:text-slate-100">
                  {selectedArticle.summary}
                </p>
              </div>
            )}

            {/* Helpful explanation */}
            <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line space-y-3">
              {selectedArticle.answer}
            </div>

            {/* Next recommended action */}
            {relatedQuestions.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Next recommended action</p>
                <button
                  onClick={() => handleSuggestedQuestion(relatedQuestions[0].question)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  {relatedQuestions[0].question}
                </button>
              </div>
            )}

            {/* Related Articles */}
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Related Articles</p>
              <div className="space-y-2">
                {(relatedQuestions.length > 0 ? relatedQuestions : [])
                  .slice(0, 4)
                  .map((article) => (
                  <button
                    key={article.id}
                    onClick={() => handleSuggestedQuestion(article.question)}
                    className="w-full text-left p-2.5 bg-white dark:bg-slate-600 hover:bg-slate-100 dark:hover:bg-slate-500 rounded-lg transition-colors flex items-center gap-2 group"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0" />
                    <span className="text-xs text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white">
                      {article.question}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Suggested Prompts */}
        {!showResults && (
          <div className="space-y-3 sm:space-y-4">
            {/* Start Here recommendation */}
            <div className="p-2.5 sm:p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-blue-900 dark:text-blue-100 leading-tight">Start here: Your first 15 minutes</p>
                  <p className="text-[11px] text-blue-800/80 dark:text-blue-200/80 mt-0.5 leading-snug">Setup checklist → Forwarding → Test → First Customer → Payment Request</p>
                </div>
                <button
                  onClick={() => handleSuggestedQuestion('Setup checklist')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                >
                  Begin
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <div className="w-1 h-3 bg-blue-600 rounded-full"></div>
              <p className="text-[11px] sm:text-xs font-semibold text-slate-900 dark:text-white">Suggested questions</p>
            </div>
            <div className="space-y-3">
              {suggestedPrompts.map((category) => (
                <div key={category.category} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <div className="p-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
                      {category.icon}
                    </div>
                    <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide leading-tight">{category.category}</span>
                  </div>
                  <div className="pl-7 space-y-1">
                    {category.prompts.map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSuggestedQuestion(prompt)}
                        className="w-full text-left px-2 py-1.5 sm:py-1.5 bg-slate-50/80 dark:bg-slate-700/30 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-md transition-colors flex items-center gap-2 group border border-transparent hover:border-slate-200/50 dark:hover:border-slate-600/50"
                      >
                        <ChevronRight className="w-3 h-3 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0 transition-colors" />
                        <span className="text-xs text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors leading-snug">
                          {prompt}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
