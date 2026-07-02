'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, MessageCircle, X, ChevronRight, ArrowRight, Clock, Calendar, BookOpen, Mail, Users, Calendar as CalendarIcon, CreditCard, Bot, TrendingUp } from 'lucide-react'
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

const suggestedPrompts: SuggestedPrompt[] = [
  {
    category: 'Customers',
    icon: <Users className="w-4 h-4" />,
    prompts: [
      'Who should I call back today?',
      'Summarize today\'s new leads.',
      'Which customers haven\'t replied?'
    ]
  },
  {
    category: 'Schedule',
    icon: <CalendarIcon className="w-4 h-4" />,
    prompts: [
      'What\'s on my schedule tomorrow?',
      'Do I have any afternoon openings?'
    ]
  },
  {
    category: 'Payments',
    icon: <CreditCard className="w-4 h-4" />,
    prompts: [
      'Who still owes me money?',
      'Show unpaid payment requests.'
    ]
  },
  {
    category: 'AI Receptionist',
    icon: <Bot className="w-4 h-4" />,
    prompts: [
      'Summarize today\'s AI calls.',
      'Which AI calls need follow-up?'
    ]
  },
  {
    category: 'Business',
    icon: <TrendingUp className="w-4 h-4" />,
    prompts: [
      'How many leads did I receive this week?',
      'What\'s my busiest day?'
    ]
  }
]

export default function ReplyFlowAssistant({ className = '', defaultCategory, context, onClose }: ReplyFlowAssistantProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedArticle, setSelectedArticle] = useState<AssistantArticle | null>(null)
  const [showResults, setShowResults] = useState(false)
  const [isAccountSpecific, setIsAccountSpecific] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [relatedQuestions, setRelatedQuestions] = useState<AssistantArticle[]>([])

  const suggestedArticles = useMemo(
    () => documentationProvider.getSuggestedArticles(defaultCategory, context, 4),
    [defaultCategory, context]
  )

  // Auto-focus search input when assistant opens.
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [])

  const reset = useCallback(() => {
    setQuery('')
    setResults([])
    setSelectedArticle(null)
    setShowResults(false)
    setIsAccountSpecific(false)
    setHasSearched(false)
    setSelectedIndex(-1)
    setRelatedQuestions([])
    inputRef.current?.focus()
  }, [])

  const performSearch = useCallback((searchQuery: string) => {
    const trimmed = searchQuery.trim()
    if (!trimmed) return

    const searchResults = engine.search(trimmed, context ?? {}, { limit: 5 })
    const isAccount = searchResults.length === 0 && documentationProvider.canAnswer(trimmed, context ?? {})

    setHasSearched(true)
    setIsAccountSpecific(!isAccount)
    setResults(searchResults)
    setSelectedArticle(searchResults[0]?.article ?? null)
    setSelectedIndex(searchResults.length > 0 ? 0 : -1)

    if (searchResults.length > 0) {
      setRelatedQuestions(
        documentationProvider.getRelatedArticles(searchResults[0].article.id, 3)
      )
    } else {
      setRelatedQuestions(suggestedArticles)
    }

    setShowResults(true)
  }, [context, suggestedArticles])

  const handleSearch = () => performSearch(query)

  const handleSuggestedQuestion = (question: string) => {
    setQuery(question)
    performSearch(question)
  }

  const handleResultClick = (article: AssistantArticle, index: number) => {
    setSelectedArticle(article)
    setSelectedIndex(index)
    setRelatedQuestions(documentationProvider.getRelatedArticles(article.id, 3))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex >= 0 && results[selectedIndex]) {
        handleResultClick(results[selectedIndex].article, selectedIndex)
      } else {
        handleSearch()
      }
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

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 w-full ${className}`}>
      <div className="p-5 sm:p-6">
        {/* Header */}
        <div className="flex items-start gap-3 mb-5">
          <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-sm">
            <MessageCircle className="w-5.5 h-5.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white leading-tight">ReplyFlow Assistant</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
              Ask questions about your customers, appointments, conversations, and business.
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
              aria-label="Close ReplyFlow Assistant"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Search Box */}
        <div className="relative mb-4">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your business..."
            className="w-full pl-11 pr-11 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
          {query && (
            <button
              onClick={reset}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-md hover:bg-slate-200 dark:hover:bg-slate-600"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search Button */}
        <button
          onClick={handleSearch}
          disabled={!query.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white font-semibold py-3 px-6 rounded-xl transition-colors mb-6 shadow-sm hover:shadow disabled:shadow-none"
        >
          Ask ReplyFlow Assistant
        </button>

        {/* Results */}
        {showResults && (
          <div className="mb-4 space-y-4" ref={resultsRef}>
            {/* Account-specific fallback */}
            {isAccountSpecific && (
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
            {!isAccountSpecific && results.length === 0 && (
              <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-5">
                <p className="text-slate-900 dark:text-white font-medium mb-1">No matching documentation found.</p>
                <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
                  Try a different phrase, browse the knowledge base, or contact support.
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    onClick={() => router.push('/faq')}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-500 transition-colors"
                  >
                    <BookOpen className="w-4 h-4" />
                    Browse Documentation
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
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Suggested articles:</p>
                    <div className="space-y-2">
                      {suggestedArticles.map(article => (
                        <button
                          key={article.id}
                          onClick={() => handleSuggestedQuestion(article.question)}
                          className="w-full text-left p-2 bg-white dark:bg-slate-600 hover:bg-slate-100 dark:hover:bg-slate-500 rounded-lg transition-colors flex items-center gap-2 group"
                        >
                          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0" />
                          <span className="text-sm text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white">
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
            {results.length > 0 && (
              <div className="space-y-3">
                {results.map((result, index) => {
                  const isSelected = selectedArticle?.id === result.article.id
                  const isHighlighted = selectedIndex === index
                  return (
                    <button
                      key={result.article.id}
                      data-selected={isHighlighted}
                      onClick={() => handleResultClick(result.article, index)}
                      className={`w-full text-left rounded-xl border transition-colors p-4 ${
                        isSelected || isHighlighted
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                          : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded">
                          {result.article.category}
                        </span>
                        <div className="flex items-center gap-3">
                          {readingTimeLabel(result.article.readingTime)}
                          {lastUpdatedLabel(result.article.lastUpdated)}
                        </div>
                      </div>
                      <h4 className="font-semibold text-slate-900 dark:text-white mb-1">
                        {highlightText(result.article.question, result.matchedTerms)}
                      </h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                        {highlightText(result.article.summary, result.matchedTerms)}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Selected article detail */}
            {selectedArticle && results.length > 0 && (
              <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded">
                    {selectedArticle.category}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Source: {selectedArticle.source}</span>
                </div>
                <h4 className="font-semibold text-slate-900 dark:text-white mb-2">{selectedArticle.question}</h4>
                <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                  {selectedArticle.answer}
                </div>

                {/* Article-specific related questions */}
                {selectedArticle.relatedQuestions && selectedArticle.relatedQuestions.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Related questions:</p>
                    <div className="space-y-2">
                      {selectedArticle.relatedQuestions.map((question, i) => (
                        <button
                          key={i}
                          onClick={() => handleSuggestedQuestion(question)}
                          className="w-full text-left p-2 bg-white dark:bg-slate-600 hover:bg-slate-100 dark:hover:bg-slate-500 rounded-lg transition-colors flex items-center gap-2 group"
                        >
                          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0" />
                          <span className="text-sm text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white">
                            {question}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Suggested Prompts */}
        {!showResults && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-blue-600 rounded-full"></div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Suggested questions</p>
            </div>
            <div className="space-y-3">
              {suggestedPrompts.map((category) => (
                <div key={category.category} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <div className="p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
                      {category.icon}
                    </div>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">{category.category}</span>
                  </div>
                  <div className="pl-10 space-y-1.5">
                    {category.prompts.map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSuggestedQuestion(prompt)}
                        className="w-full text-left px-3 py-2.5 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-2 group border border-transparent hover:border-slate-200 dark:hover:border-slate-600"
                      >
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0 transition-colors" />
                        <span className="text-sm text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
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
  )
}
