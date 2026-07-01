import type { AssistantContext, AssistantSearchOptions, KnowledgeProvider, SearchResult } from './types'

export class ReplyFlowAssistantEngine {
  private providers: KnowledgeProvider[] = []

  registerProvider(provider: KnowledgeProvider): void {
    this.providers.push(provider)
    this.providers.sort((a, b) => b.priority - a.priority)
  }

  search(query: string, context: AssistantContext, options: AssistantSearchOptions = {}): SearchResult[] {
    const allResults: SearchResult[] = []
    for (const provider of this.providers) {
      if (!provider.canAnswer(query, context)) continue
      const results = provider.search(query, context, options)
      allResults.push(...results)
    }

    // Deduplicate by article id, keeping the highest score.
    const bestById = new Map<string, SearchResult>()
    for (const result of allResults) {
      const existing = bestById.get(result.article.id)
      if (!existing || result.score > existing.score) {
        bestById.set(result.article.id, result)
      }
    }

    const limit = options.limit ?? 5
    return Array.from(bestById.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  getProvider(id: string): KnowledgeProvider | undefined {
    return this.providers.find(p => p.id === id)
  }
}
