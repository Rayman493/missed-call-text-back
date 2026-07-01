import type { AssistantArticle, AssistantContext, KnowledgeProvider, SearchResult, AssistantSearchOptions } from '../types'
import { searchArticles, isAccountSpecificQuery } from '../search-engine'

export interface DocumentationProviderOptions {
  articles: AssistantArticle[]
  defaultLimit?: number
  minScore?: number
  minConfidence?: 'high' | 'medium' | 'low'
}

export class DocumentationProvider implements KnowledgeProvider {
  readonly id = 'documentation'
  readonly name = 'ReplyFlow Documentation'
  readonly priority = 100

  private articles: AssistantArticle[]
  private options: Required<Pick<AssistantSearchOptions, 'minScore' | 'minConfidence'>> & { defaultLimit: number }

  constructor(options: DocumentationProviderOptions) {
    this.articles = options.articles
    this.options = {
      minScore: options.minScore ?? 5,
      minConfidence: options.minConfidence ?? 'low',
      defaultLimit: options.defaultLimit ?? 5,
    }
  }

  canAnswer(query: string, _context: AssistantContext): boolean {
    return !isAccountSpecificQuery(query)
  }

  search(query: string, context: AssistantContext, options?: AssistantSearchOptions): SearchResult[] {
    return searchArticles(this.articles, query, context, {
      minScore: options?.minScore ?? this.options.minScore,
      minConfidence: options?.minConfidence ?? this.options.minConfidence,
      limit: options?.limit ?? this.options.defaultLimit,
      preferredCategory: options?.preferredCategory,
    })
  }

  getRelatedArticles(articleId: string, limit = 3): AssistantArticle[] {
    const current = this.articles.find(a => a.id === articleId)
    if (!current) return []

    return this.articles
      .filter(a => a.id !== articleId)
      .map(article => {
        let score = 0
        if (article.category === current.category) score += 3
        const currentKeywords = new Set(current.keywords.map(k => k.toLowerCase()))
        for (const keyword of article.keywords) {
          if (currentKeywords.has(keyword.toLowerCase())) score += 2
        }
        // Boost articles that are explicitly listed as related for the current article.
        if (current.relatedQuestions?.some(q => article.question.toLowerCase() === q.toLowerCase() || article.id === q)) {
          score += 5
        }
        return { article, score }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.article)
  }

  getSuggestedArticles(category?: string, context?: AssistantContext, limit = 4): AssistantArticle[] {
    let pool = this.articles

    if (category) {
      pool = pool.filter(a => a.category === category)
    }

    // Context-specific boosting
    const boostedIds = new Set<string>()
    if (context?.forwardingVerified === false) {
      ['forwarding-direction', 'test-call-second-phone', 'forwarding-not-working', 'test-call-failed'].forEach(id => boostedIds.add(id))
    }
    if (context?.hasLeads === false) {
      ['no-lead-appeared', 'test-replyflow', 'setup-time'].forEach(id => boostedIds.add(id))
    }
    if (context?.isTrial) {
      ['billing-trial-details', 'trial-billing', 'cancel-trial'].forEach(id => boostedIds.add(id))
    }
    if (context?.calendarConnected === false) {
      ['connect-google-calendar', 'calendar-not-connected'].forEach(id => boostedIds.add(id))
    }
    if (context?.hasLeads) {
      ['lead-statuses', 'reply-customer', 'follow-ups-work'].forEach(id => boostedIds.add(id))
    }

    const priorityIds = [
      'replyflow-overview',
      'forwarding-direction',
      'ai-voice',
      'sms-not-sent',
      'pricing',
      'connect-google-calendar',
      'follow-ups-work',
    ]

    return pool
      .slice()
      .sort((a, b) => {
        const aBoosted = boostedIds.has(a.id) ? 1 : 0
        const bBoosted = boostedIds.has(b.id) ? 1 : 0
        if (aBoosted !== bBoosted) return bBoosted - aBoosted
        const aPriority = priorityIds.indexOf(a.id)
        const bPriority = priorityIds.indexOf(b.id)
        if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority
        if (aPriority !== -1) return -1
        if (bPriority !== -1) return 1
        return 0
      })
      .slice(0, limit)
  }
}
