'use client'

import { useState } from 'react'
import { Search, MessageCircle, X, ChevronRight } from 'lucide-react'
import { searchKnowledgeBase, getRelatedArticles, getSuggestedQuestions, type HelpArticle } from '@/lib/help-assistant/knowledge-base'

export interface HelpContext {
  currentPage?: 'dashboard' | 'leads' | 'lead-detail' | 'calendar' | 'settings' | 'onboarding'
  hasLeads?: boolean
  hasRecentActivity?: boolean
  forwardingVerified?: boolean
  calendarConnected?: boolean
  hasNotifications?: boolean
  isTrial?: boolean
}

interface HelpAssistantProps {
  className?: string
  defaultCategory?: string
  context?: HelpContext
}

export default function HelpAssistant({ className = '', defaultCategory, context }: HelpAssistantProps) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<HelpArticle | null>(null)
  const [related, setRelated] = useState<HelpArticle[]>([])
  const [showResults, setShowResults] = useState(false)
  const [isAccountSpecific, setIsAccountSpecific] = useState(false)

  const suggestedQuestions = getSuggestedQuestions(defaultCategory, context)

  const handleSearch = () => {
    if (!query.trim()) return

    const searchResult = searchKnowledgeBase(query, context)
    
    if (searchResult === null) {
      // Check if it's account-specific
      const accountKeywords = ['why did my sms fail', 'sms failed', 'delivery failed', 'why didn\'t my lead appear', 'why was i charged', 'why did my ai call fail', 'ai not working', 'ai voice not working', 'ai didn\'t answer', 'voicemail not working', 'ai not picking up']
      const isAccountIssue = accountKeywords.some(keyword => query.toLowerCase().includes(keyword))
      
      if (isAccountIssue) {
        setIsAccountSpecific(true)
        setResult(null)
        // Show contextual suggestions for account issues
        const contextualSuggestions = getSuggestedQuestions(undefined, context)
        setRelated(contextualSuggestions.slice(0, 3))
      } else {
        setIsAccountSpecific(false)
        setResult(null)
        // Show closest matches as suggestions
        const allSuggestions = getSuggestedQuestions(undefined, context)
        setRelated(allSuggestions.slice(0, 3))
      }
    } else {
      setIsAccountSpecific(false)
      setResult(searchResult)
      setRelated(getRelatedArticles(searchResult.id))
    }
    
    setShowResults(true)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handleSuggestedQuestion = (question: string) => {
    setQuery(question)
    setResult(null)
    setRelated([])
    setShowResults(false)
    setTimeout(() => {
      setQuery(question)
      handleSearch()
    }, 100)
  }

  const handleRelatedClick = (article: HelpArticle) => {
    setQuery(article.question)
    setResult(article)
    setRelated(getRelatedArticles(article.id))
    setShowResults(true)
  }

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 w-full ${className}`}>
      <div className="p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Help Assistant</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">Search our documentation</p>
          </div>
        </div>

        {/* Search Box */}
        <div className="relative mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question..."
            className="w-full pl-12 pr-12 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                setResult(null)
                setRelated([])
                setShowResults(false)
                setIsAccountSpecific(false)
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2"
            >
              <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
            </button>
          )}
        </div>

        {/* Search Button */}
        <button
          onClick={handleSearch}
          disabled={!query.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white font-semibold py-3 px-6 rounded-xl transition-colors mb-6"
        >
          Search
        </button>

        {/* Results */}
        {showResults && (
          <div className="mb-4">
            {/* Account-specific fallback */}
            {isAccountSpecific && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <p className="text-amber-800 dark:text-amber-200 text-sm mb-3">
                  This may require account-specific support. Here are some related troubleshooting steps:
                </p>
                {related.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {related.map(article => (
                      <button
                        key={article.id}
                        onClick={() => handleRelatedClick(article)}
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
            {!result && !isAccountSpecific && (
              <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4">
                <p className="text-slate-600 dark:text-slate-400 text-sm mb-3">
                  I couldn't find an exact answer. Here are some related questions that might help:
                </p>
                {related.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {related.map(article => (
                      <button
                        key={article.id}
                        onClick={() => handleRelatedClick(article)}
                        className="w-full text-left p-2 bg-white dark:bg-slate-600 hover:bg-slate-100 dark:hover:bg-slate-500 rounded-lg transition-colors flex items-center gap-2 group"
                      >
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0" />
                        <span className="text-sm text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white">
                          {article.question}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-slate-600 dark:text-slate-400 text-sm">
                  Still need help? Contact support at{' '}
                  <a href="https://mail.google.com/mail/?view=cm&fs=1&to=support@replyflowhq.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
                    support@replyflowhq.com
                  </a>.
                </p>
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded">
                    {result.category}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Source: {result.source}
                  </span>
                </div>
                <h4 className="font-semibold text-slate-900 dark:text-white mb-2">{result.question}</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{result.answer}</p>
              </div>
            )}

            {/* Related Articles */}
            {related.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Related questions:</p>
                <div className="space-y-2">
                  {related.map(article => (
                    <button
                      key={article.id}
                      onClick={() => handleRelatedClick(article)}
                      className="w-full text-left p-3 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg transition-colors flex items-center gap-2 group"
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

        {/* Suggested Questions */}
        {!showResults && suggestedQuestions.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Common questions:</p>
            <div className="space-y-2">
              {suggestedQuestions.slice(0, 4).map(article => (
                <button
                  key={article.id}
                  onClick={() => handleSuggestedQuestion(article.question)}
                  className="w-full text-left p-3 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg transition-colors flex items-center gap-2 group"
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
    </div>
  )
}
