/**
 * Lightweight intent-based search engine for the ReplyFlow Assistant.
 *
 * Scoring preference:
 *   1. Exact topic / phrase matches
 *   2. Semantic similarity via keyword aliases and topic clusters
 *   3. Fuzzy word overlap
 *   4. Plain keyword overlap
 *
 * No network requests. No AI for every search.
 */

import type { AssistantArticle, AssistantContext, AssistantSearchOptions, SearchResult } from './types'

// Normalization: lowercase, remove punctuation, collapse whitespace
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter(t => t.length > 1)
}

// Fuzzy match: same first 4 chars, or one is a substring of the other
function fuzzyMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 3 || b.length < 3) return false
  if (a.startsWith(b.slice(0, 4)) || b.startsWith(a.slice(0, 4))) return true
  if (a.includes(b) || b.includes(a)) return true
  return false
}

// Word-to-word similarity: simple edit distance threshold for short words
function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1
  const len = Math.max(a.length, b.length)
  if (len === 0) return 0
  const distance = levenshtein(a, b)
  if (distance <= 1 && len <= 6) return 0.7
  if (distance <= 2 && len <= 10) return 0.5
  return 0
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => [])
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }
  return matrix[a.length][b.length]
}

// Intent aliases map common user phrasings to canonical topic terms.
const INTENT_ALIASES: Record<string, string[]> = {
  'replyflow': ['reply flow', 'replyflow', 'missed call text back', 'mctb', 'service', 'product', 'platform', 'app'],
  'what are you': ['what is replyflow', 'who are you', 'what does replyflow do', 'how does replyflow work', 'what can you do', 'what is this'],
  'sms': ['text', 'message', 'txt', 'auto reply', 'auto text', 'sms not sent', 'did not get text', 'customer did not get text', 'not receiving text'],
  'ai voice': ['ai', 'ai receptionist', 'ai call assistant', 'ai answers', 'ai picks up', 'live ai', 'voice ai', 'ai intake'],
  'forwarding': ['forward', 'divert', 'redirect', 'call forwarding', 'conditional forwarding'],
  'setup': ['install', 'configure', 'get started', 'starting', 'begin', 'setup'],
  'lead': ['customer', 'caller', 'prospect', 'missed call'],
  'calendar': ['google calendar', 'appointments', 'schedule', 'sync calendar'],
  'billing': ['payment', 'subscription', 'charge', 'trial', 'stripe', 'price', 'cost'],
  'troubleshooting': ['not working', 'broken', 'failed', 'issue', 'problem', 'error', 'doesn\'t work', 'didn\'t work'],
  'support': ['contact support', 'help', 'support email', 'talk to support'],
}

// Build a reverse alias lookup for token-level expansion.
const TOKEN_ALIASES: Record<string, string[]> = {}
for (const [canonical, aliases] of Object.entries(INTENT_ALIASES)) {
  for (const alias of aliases) {
    const tokens = tokenize(alias)
    for (const token of tokens) {
      TOKEN_ALIASES[token] = TOKEN_ALIASES[token] || []
      if (!TOKEN_ALIASES[token].includes(canonical)) {
        TOKEN_ALIASES[token].push(canonical)
      }
    }
  }
}

function getQueryIntents(query: string): string[] {
  const tokens = tokenize(query)
  const intents = new Set<string>()
  for (const token of tokens) {
    const aliases = TOKEN_ALIASES[token]
    if (aliases) {
      for (const alias of aliases) intents.add(alias)
    }
  }
  return Array.from(intents)
}

export function scoreArticle(query: string, article: AssistantArticle, context?: AssistantContext): SearchResult | null {
  const normalizedQuery = normalizeText(query)
  const queryTokens = tokenize(query)
  const queryIntents = getQueryIntents(query)
  const matchedTerms: string[] = []
  let score = 0

  // 1. Exact topic / phrase match
  // Exact match on the full question
  if (article.question.toLowerCase() === query.toLowerCase()) {
    score += 100
  } else if (normalizeText(article.question) === normalizedQuery) {
    score += 100
  }

  // Exact keyword match
  for (const keyword of article.keywords) {
    const normalizedKeyword = normalizeText(keyword)
    if (normalizedQuery.includes(normalizedKeyword)) {
      score += 30
      matchedTerms.push(keyword)
    }
  }

  // 2. Semantic / intent match using alias clusters
  const articleText = normalizeText(`${article.question} ${article.answer} ${article.summary} ${article.keywords.join(' ')}`)
  for (const intent of queryIntents) {
    if (articleText.includes(intent)) {
      score += 20
      matchedTerms.push(intent)
    }
    const aliases = INTENT_ALIASES[intent] || []
    for (const alias of aliases) {
      if (articleText.includes(alias)) {
        score += 12
        matchedTerms.push(alias)
      }
    }
  }

  // 3. Fuzzy matching between query tokens and article tokens
  const articleTokens = tokenize(`${article.question} ${article.answer} ${article.summary}`)
  for (const qToken of queryTokens) {
    let bestTokenScore = 0
    for (const aToken of articleTokens) {
      if (fuzzyMatch(qToken, aToken)) {
        bestTokenScore = Math.max(bestTokenScore, 3)
      } else {
        const sim = wordSimilarity(qToken, aToken)
        if (sim > 0) {
          bestTokenScore = Math.max(bestTokenScore, sim * 3)
        }
      }
    }
    score += bestTokenScore
    if (bestTokenScore > 0) matchedTerms.push(qToken)
  }

  // 4. Keyword overlap
  const articleKeywords = article.keywords.map(k => normalizeText(k))
  for (const qToken of queryTokens) {
    for (const keyword of articleKeywords) {
      if (keyword.includes(qToken)) {
        score += 2
        matchedTerms.push(qToken)
      } else if (qToken.includes(keyword) && keyword.length > 2) {
        score += 2
        matchedTerms.push(keyword)
      }
    }
  }

  // 5. Context-based boosting
  if (context) {
    if (context.forwardingVerified === false && article.category === 'Troubleshooting' &&
        (article.id.includes('forwarding') || article.id.includes('test-call'))) {
      score += 5
    }
    if (context.calendarConnected === false && article.category === 'Troubleshooting' && article.id.includes('calendar')) {
      score += 5
    }
    if (context.hasLeads === false && article.category === 'Troubleshooting' &&
        (article.id.includes('lead') || article.id.includes('test'))) {
      score += 5
    }
    if (context.isTrial && article.category === 'Billing') {
      score += 3
    }
  }

  // 6. Category page boosting
  if (context?.currentPage) {
    const pageCategoryMap: Record<string, string> = {
      dashboard: 'Dashboard',
      leads: 'Leads',
      'lead-detail': 'Lead Detail',
      calendar: 'Calendar',
      settings: 'Settings',
      onboarding: 'Onboarding',
    }
    if (article.category === pageCategoryMap[context.currentPage]) {
      score += 4
    }
  }

  // Confidence classification
  let confidence: SearchResult['confidence'] = 'low'
  if (score >= 40) confidence = 'high'
  else if (score >= 20) confidence = 'medium'

  if (score === 0) return null

  return {
    article,
    score,
    confidence,
    matchedTerms: Array.from(new Set(matchedTerms)),
  }
}

export function searchArticles(
  articles: AssistantArticle[],
  query: string,
  context?: AssistantContext,
  options: AssistantSearchOptions = {}
): SearchResult[] {
  const { minScore = 5, minConfidence = 'low', limit = 5, preferredCategory } = options

  const confidenceThreshold = { high: 3, medium: 2, low: 1 }[minConfidence]

  const results: SearchResult[] = []
  for (const article of articles) {
    const result = scoreArticle(query, article, context)
    if (!result) continue
    if (result.score < minScore) continue
    if ({ high: 3, medium: 2, low: 1 }[result.confidence] < confidenceThreshold) continue

    if (preferredCategory && article.category === preferredCategory) {
      result.score += 6
    }

    results.push(result)
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function isAccountSpecificQuery(query: string): boolean {
  const normalized = normalizeText(query)
  const accountSpecific = [
    'why did my sms fail', 'sms failed', 'message not delivered', 'delivery failed',
    'why didn\'t my lead appear', 'lead not showing', 'missing lead', 'why was i charged',
    'unexpected charge', 'billing error', 'why did my ai call fail', 'ai not working',
    'ai voice not working', 'ai didn\'t answer', 'voicemail not working', 'ai not picking up',
    'my specific', 'my account', 'why didn\'t it work for me', 'why is it not working',
    'customer didn\'t get text', 'customer did not get text', 'did not receive text',
    'did not get text', 'didn\'t get text',
  ]
  return accountSpecific.some(k => normalized.includes(k))
}
