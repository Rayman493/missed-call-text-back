# Intelligence Unification Audit Report

## Executive Summary

ReplyFlow currently has multiple intelligence surfaces with overlapping purposes and user-facing concepts. This audit recommends unifying all intelligence under a single concept called **"Focus"** while preserving the underlying architecture. The goal: **One intelligent system. Many internal components. One simple experience.**

---

## 1. Current Intelligence Surfaces Audit

### 1.1 Business Memory

**Status:** Internal Architecture (Not User-Facing)

**Purpose:** Derived business knowledge with provenance and confidence metadata

**User Exposure:** None (internal system)

**Current Implementation:**
- `src/lib/business-memory/memory-service.ts`
- `CustomerMemory` interface with fields like repeatCustomer, lifetimeRevenue, averagePaymentDelay, preferredContactMethod, etc.
- Confidence thresholds (≥ 70)
- Provenance tracking
- 5-minute cache

**User-Facing Exposure:**
- None (purely internal)
- Used by insight generators
- Used by advisor generators
- Used by customer indicators in LeadCard
- Used by messaging context hints

---

### 1.2 Insights

**Status:** User-Facing Component (Dashboard & Customer Detail)

**Purpose:** Categorized, prioritized, actionable observations about the business

**Current Implementation:**
- `src/components/DashboardInsights.tsx` - Dashboard-level insights
- `src/components/CustomerInsights.tsx` - Customer-specific insights
- `src/lib/insights/generators/` - 5 generators (payment, follow-up, scheduling, communication, customer-preference)
- `src/lib/insights/insights-service.ts` - Service orchestration

**User-Facing Exposure:**
- Dashboard: "Insights" card showing business-wide observations
- Customer Detail: "Insights" card showing customer-specific observations
- Categories: payment, follow-up, scheduling, communication, customer-preference, business-trend, workflow-reminder
- Visual: Icon + title + description + optional action link
- Confidence threshold: ≥ 70
- Explainability: Tracks Business Memory fields used

**Example:**
```
[Icon] Payment overdue
3 customers have payments pending beyond 7 days
View Customers →
```

---

### 1.3 Suggested Actions

**Status:** User-Facing Component (Dashboard & Customer Detail)

**Purpose:** Actionable next steps derived from insights

**Current Implementation:**
- `src/components/DashboardSuggestedActions.tsx` - Dashboard-level actions
- `src/components/CustomerSuggestedActions.tsx` - Customer-specific actions
- `src/lib/suggested-actions/generators/` - 4 generators (communication, follow-up, payment, scheduling)
- `src/lib/suggested-actions/suggested-actions-service.ts` - Service orchestration
- `src/lib/outcomes/action-handlers.ts` - Outcome tracking

**User-Facing Exposure:**
- Dashboard: "Suggested Actions" card showing business-wide actions
- Customer Detail: "Suggested Actions" card showing customer-specific actions
- Types: send-message, schedule-appointment, request-payment
- Visual: Icon + title + recommended action + optional suggested message
- Completion tracking: Mark as shown, mark as completed
- Dismiss functionality
- Outcome tracking for learning

**Example:**
```
[Icon] Send payment reminder
Request payment from Ryan
"Hi Ryan, just following up on the invoice from last week..."
[Dismiss]
```

---

### 1.4 Business Advisor

**Status:** Designed But Not Implemented

**Purpose:** High-value operational advice to help owners run better businesses

**Current Implementation:**
- `BUSINESS_ADVISOR_IMPLEMENTATION_SUMMARY.md` - Design document only
- No UI components exist
- No service implementation

**User-Facing Exposure:**
- None (design phase only)

**Planned Categories:**
- Money (cash flow optimization)
- Customers (retention/re-engagement)
- Growth (service performance/trends)
- Scheduling (appointment optimization)
- Communication (response time/follow-ups)
- Efficiency (workflow optimization)

**Planned UI:**
- Lightweight Advisor section
- No AI branding
- No avatar/chatbot/sparkle icons
- Practical business advice

---

### 1.5 Business Health

**Status:** Not Implemented

**Purpose:** Overall business health assessment

**Current Implementation:**
- None (concept only)

**User-Facing Exposure:**
- None

---

### 1.6 Today's Snapshot

**Status:** User-Facing Component (Dashboard)

**Purpose:** Quick overview of today's business status

**Current Implementation:**
- `src/components/TodaySnapshot.tsx` - Component exists
- Used in DashboardContent.tsx

**User-Facing Exposure:**
- Dashboard: "Today's Snapshot" section
- Shows: Today's metrics, quick actions, upcoming items

---

## 2. Problem Analysis

### 2.1 Concept Overlap

**Insights vs Suggested Actions:**
- Both are derived from Business Memory
- Both are categorized (payment, follow-up, scheduling, communication)
- Both have confidence thresholds
- Both are displayed in similar card formats
- **Problem:** Users see two similar-looking cards with different labels

**Insights vs Business Advisor:**
- Both provide observations about the business
- Both answer "what's happening"
- **Problem:** Advisor is designed as a separate concept when it could be integrated into insights

**Today's Snapshot vs Dashboard Metrics:**
- Both show metrics
- Both show today's status
- **Problem:** Redundant information display

### 2.2 Cognitive Load

**Current Visible Concepts:**
1. Insights (Dashboard)
2. Suggested Actions (Dashboard)
3. Insights (Customer Detail)
4. Suggested Actions (Customer Detail)
5. Today's Snapshot (Dashboard)
6. Customer Indicators (Customers List)
7. Messaging Context Hints (Conversation Composer)

**Total:** 7 visible intelligence concepts

**Problem:** Users must understand what each concept means and how they differ.

### 2.3 Fragmented Experience

**Dashboard:**
- Today's Snapshot (metrics)
- Insights (observations)
- Suggested Actions (actions)

**Customer Detail:**
- Insights (observations)
- Suggested Actions (actions)

**Customers List:**
- Customer Indicators (badges)

**Messaging:**
- Context Hints (inline text)

**Problem:** Intelligence is scattered across different UI patterns with different names.

---

## 3. Proposed Unification: Focus

### 3.1 Core Concept

**Focus** = A single, unified intelligence surface that presents:

1. **What matters most right now** (prioritized by context and time)
2. **Why it matters** (evidence from Business Memory)
3. **What to do about it** (actionable next steps)

All intelligence flows through Focus. Users see one concept, not seven.

### 3.2 Focus Structure

```typescript
interface FocusItem {
  id: string
  businessId: string
  customerId?: string
  
  // Content
  title: string              // One sentence, clear and actionable
  description: string         // What's happening
  evidence: string[]          // Supporting data from Business Memory
  confidence: number         // 0-100
  
  // Action
  action: {
    label: string            // "Send message", "View customer", etc.
    destination: string      // Link or action identifier
    suggestedContent?: string // Optional pre-filled content
  }
  
  // Metadata
  category: FocusCategory    // money, customers, growth, scheduling, communication, efficiency
  priority: FocusPriority    // urgent, high, medium, low
  source: FocusSource        // insight, advisor, recommendation, trend
  
  // Temporal
  generatedAt: Date
  expiresAt: Date
}

enum FocusCategory {
  MONEY = 'money',
  CUSTOMERS = 'customers',
  GROWTH = 'growth',
  SCHEDULING = 'scheduling',
  COMMUNICATION = 'communication',
  EFFICIENCY = 'efficiency',
}

enum FocusPriority {
  URGENT = 'urgent',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

enum FocusSource {
  INSIGHT = 'insight',           // From insight generators
  ADVISOR = 'advisor',           // From advisor generators
  RECOMMENDATION = 'recommendation', // From event watchers
  TREND = 'trend',               // From trend tracker
  MOMENT = 'moment',             // Business moments
}
```

### 3.3 Focus UI Component

**Single Component:**
```typescript
// src/components/FocusSection.tsx

export function FocusSection({ 
  businessId, 
  customerId,
  context 
}: {
  businessId: string
  customerId?: string
  context: 'dashboard' | 'customer' | 'schedule' | 'payments'
}) {
  const [focusItems, setFocusItems] = useState<FocusItem[]>([])
  
  // Load all focus items for the context
  // Sort by priority
  // Display unified list
  
  return (
    <div className="focus-section">
      <div className="focus-header">
        <h2>Focus</h2>
        <p className="subtitle">What matters most right now</p>
      </div>
      
      <div className="focus-items">
        {focusItems.slice(0, 5).map(item => (
          <FocusCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}
```

**Unified Card Design:**
```typescript
// src/components/FocusCard.tsx

export function FocusCard({ item }: { item: FocusItem }) {
  return (
    <div className={`focus-card priority-${item.priority}`}>
      {/* Category badge */}
      <span className="category-badge">{item.category}</span>
      
      {/* Title */}
      <h3>{item.title}</h3>
      
      {/* Description */}
      <p>{item.description}</p>
      
      {/* Evidence */}
      <ul className="evidence-list">
        {item.evidence.map(e => <li key={e}>{e}</li>)}
      </ul>
      
      {/* Action */}
      <a href={item.action.destination} className="action-link">
        {item.action.label} →
      </a>
    </div>
  )
}
```

---

## 4. Mapping Current Surfaces to Focus

### 4.1 Insights → Focus

**Current:**
- Separate "Insights" card
- Shows observations
- Optional action link

**Becomes:**
- Focus items with `source: 'insight'`
- Integrated into unified Focus list
- No separate "Insights" concept

**Mapping:**
```typescript
// Insight → FocusItem
{
  id: insight.id,
  title: insight.title,
  description: insight.description,
  evidence: insight.explainability?.businessMemoryFields?.map(field => 
    memoryService.getFieldValue(field)
  ) || [],
  confidence: insight.confidence,
  action: insight.primaryAction ? {
    label: insight.primaryAction.label,
    destination: insight.primaryAction.href,
  } : null,
  category: mapInsightTypeToFocusCategory(insight.type),
  priority: mapConfidenceToPriority(insight.confidence),
  source: 'insight',
  generatedAt: insight.generatedAt,
  expiresAt: insight.expiresAt,
}
```

### 4.2 Suggested Actions → Focus

**Current:**
- Separate "Suggested Actions" card
- Shows actionable next steps
- Completion tracking

**Becomes:**
- Focus items with `source: 'recommendation'`
- Integrated into unified Focus list
- Completion tracking preserved
- No separate "Suggested Actions" concept

**Mapping:**
```typescript
// SuggestedAction → FocusItem
{
  id: action.id,
  title: action.title,
  description: action.recommendedAction,
  evidence: [action.context || ''],
  confidence: 85, // Actions have high confidence
  action: {
    label: action.title,
    destination: action.destinationLink,
    suggestedContent: action.suggestedMessage,
  },
  category: mapActionTypeToFocusCategory(action.actionType),
  priority: 'high',
  source: 'recommendation',
  generatedAt: action.generatedAt,
  expiresAt: action.expiresAt,
}
```

### 4.3 Business Advisor → Focus

**Current:**
- Designed but not implemented
- Would have separate "Business Advisor" section

**Becomes:**
- Focus items with `source: 'advisor'`
- Integrated into unified Focus list
- No separate "Business Advisor" concept

**Mapping:**
```typescript
// AdvisorRecommendation → FocusItem
{
  id: recommendation.id,
  title: recommendation.title,
  description: recommendation.reason,
  evidence: recommendation.supportingEvidence,
  confidence: recommendation.confidence,
  action: {
    label: recommendation.suggestedAction,
    destination: recommendation.destinationLink,
  },
  category: recommendation.category,
  priority: mapConfidenceToPriority(recommendation.confidence),
  source: 'advisor',
  generatedAt: recommendation.generatedAt,
  expiresAt: recommendation.validUntil,
}
```

### 4.4 Business Health → Focus

**Current:**
- Not implemented
- Would have been separate "Business Health" section

**Becomes:**
- Focus items with `source: 'trend'`
- Integrated into unified Focus list
- No separate "Business Health" concept

**Mapping:**
```typescript
// BusinessTrend → FocusItem
{
  id: trend.id,
  title: trend.observation,
  description: `Your ${trend.metric} is ${trend.direction}`,
  evidence: [
    `Previous: ${trend.previousValue}`,
    `Current: ${trend.value}`,
  ],
  confidence: 80,
  action: null, // Trends are informational, not actionable
  category: mapMetricToFocusCategory(trend.metric),
  priority: 'low',
  source: 'trend',
  generatedAt: trend.generatedAt,
  expiresAt: new Date(trend.generatedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
}
```

### 4.5 Today's Snapshot → Focus

**Current:**
- Separate "Today's Snapshot" section
- Shows metrics and quick actions

**Becomes:**
- Focus items for actionable items (quick actions)
- Metrics become supporting context (below Focus)
- No separate "Today's Snapshot" concept

**Mapping:**
```typescript
// Today's Snapshot → Focus (for actionable items only)
// Metrics remain as supporting context below Focus
```

### 4.6 Customer Indicators → Focus

**Current:**
- Badges on customer cards in Customers List
- Lightweight: Repeat, High Value, Slow Responder, Quick Payer

**Becomes:**
- Remain as lightweight indicators (supporting context)
- Not full Focus items
- No change needed

**Rationale:** These are quick visual cues, not actionable intelligence.

### 4.7 Messaging Context Hints → Focus

**Current:**
- Inline text in ConversationComposer
- Shows preferred contact method, response time

**Becomes:**
- Remain as inline hints (supporting context)
- Not full Focus items
- No change needed

**Rationale:** These are contextual aids, not actionable intelligence.

---

## 5. Focus Architecture

### 5.1 Focus Service

```typescript
// src/lib/focus/focus-service.ts

export class FocusService {
  private insightService: InsightService
  private suggestedActionsService: SuggestedActionsService
  private advisorService: AdvisorService
  private trendTracker: TrendTracker
  private eventWatcher: EventWatcher
  
  // Get all focus items for a business
  async getFocusItems(businessId: string, context?: string): Promise<FocusItem[]> {
    const items: FocusItem[] = []
    
    // Get insights
    const insights = await this.insightService.generateInsights(businessId)
    items.push(...this.mapInsightsToFocus(insights))
    
    // Get suggested actions
    const actions = await this.suggestedActionsService.generateActions(businessId)
    items.push(...this.mapActionsToFocus(actions))
    
    // Get advisor recommendations (when implemented)
    const advisorRecs = await this.advisorService.getRecommendations(businessId)
    items.push(...this.mapAdvisorToFocus(advisorRecs))
    
    // Get trends (when implemented)
    const trends = await this.trendTracker.getTrends(businessId)
    items.push(...this.mapTrendsToFocus(trends))
    
    // Get event watcher recommendations (when implemented)
    const recommendations = await this.eventWatcher.getRecommendations(businessId)
    items.push(...this.mapRecommendationsToFocus(recommendations))
    
    // Filter by context
    const filtered = this.filterByContext(items, context)
    
    // Sort by priority
    const sorted = this.sortByPriority(filtered)
    
    // Apply quality gates
    const qualified = this.applyQualityGates(sorted)
    
    return qualified
  }
  
  private filterByContext(items: FocusItem[], context: string): FocusItem[] {
    // Context-aware filtering
    switch (context) {
      case 'dashboard':
        return items.filter(item => !item.customerId)
      case 'customer':
        return items.filter(item => item.customerId === context.customerId)
      case 'schedule':
        return items.filter(item => 
          item.category === FocusCategory.SCHEDULING ||
          item.category === FocusCategory.EFFICIENCY
        )
      case 'payments':
        return items.filter(item => item.category === FocusCategory.MONEY)
      default:
        return items
    }
  }
  
  private sortByPriority(items: FocusItem[]): FocusItem[] {
    const priorityOrder = {
      [FocusPriority.URGENT]: 0,
      [FocusPriority.HIGH]: 1,
      [FocusPriority.MEDIUM]: 2,
      [FocusPriority.LOW]: 3,
    }
    
    return items.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
      if (priorityDiff !== 0) return priorityDiff
      
      // Within same priority, sort by confidence
      return b.confidence - a.confidence
    })
  }
  
  private applyQualityGates(items: FocusItem[]): FocusItem[] {
    return items.filter(item => {
      // Confidence threshold
      if (item.confidence < 70) return false
      
      // Not expired
      if (new Date() > item.expiresAt) return false
      
      // Has action (except trends)
      if (item.source !== 'trend' && !item.action) return false
      
      return true
    })
  }
}
```

### 5.2 Focus Generator Interface

```typescript
// src/lib/focus/focus-generator.ts

export interface FocusGenerator {
  name: string
  source: FocusSource
  generate(businessId: string, customerId?: string): Promise<FocusItem[]>
  minConfidence: number
}

// Existing systems become Focus generators:
// - Insight generators become focus generators
// - Suggested action generators become focus generators
// - Advisor generators become focus generators
// - Trend tracker becomes focus generator
// - Event watchers become focus generators
```

---

## 6. User Experience Changes

### 6.1 Before Unification

**Dashboard:**
```
┌─────────────────────────┐
│ Today's Snapshot        │  ← Metrics + quick actions
├─────────────────────────┤
│ Insights                │  ← Observations
├─────────────────────────┤
│ Suggested Actions       │  ← Actionable steps
└─────────────────────────┘
```

**Customer Detail:**
```
┌─────────────────────────┐
│ Customer Info           │
├─────────────────────────┤
│ Insights                │  ← Customer observations
├─────────────────────────┤
│ Suggested Actions       │  ← Customer actions
└─────────────────────────┘
```

**Customers List:**
```
┌─────────────────────────┐
│ [Repeat] Ryan          │  ← Customer indicators
│ [High Value] Sarah      │
└─────────────────────────┘
```

**Messaging:**
```
┌─────────────────────────┐
│ Prefers SMS            │  ← Context hints
│ Usually responds in 2h │
└─────────────────────────┘
```

### 6.2 After Unification

**Dashboard:**
```
┌─────────────────────────┐
│ Focus                   │  ← Unified intelligence
│ What matters most now   │
├─────────────────────────┤
│ [Urgent] Payment overdue│
│ 3 customers pending > 7d│
│ View Customers →        │
├─────────────────────────┤
│ [High] Ryan needs follow-up│
│ Last contact: 45 days   │
│ Send message →          │
├─────────────────────────┤
│ [Medium] Payment speed improving│
│ Down 15% this month     │
└─────────────────────────┘

┌─────────────────────────┐
│ Today's Metrics         │  ← Supporting context
│ Revenue: $12,500        │
│ Jobs: 8                 │
│ Leads: 3                │
└─────────────────────────┘
```

**Customer Detail:**
```
┌─────────────────────────┐
│ Focus                   │  ← Customer-specific intelligence
│ What matters for Ryan   │
├─────────────────────────┤
│ [Urgent] Payment overdue│
│ 9 days since invoice    │
│ Request payment →       │
├─────────────────────────┤
│ [High] Quick payer      │
│ Usually pays in 24h     │
└─────────────────────────┘

┌─────────────────────────┐
│ Customer Context        │  ← Supporting context
│ [Repeat] [High Value]   │  ← Customer indicators
│ Prefers SMS             │
└─────────────────────────┘
```

**Customers List:**
```
┌─────────────────────────┐
│ [Repeat] [High Value]   │  ← Customer indicators (unchanged)
│ Ryan                    │
│ Last contact: 45 days   │
└─────────────────────────┘
```

**Messaging:**
```
┌─────────────────────────┐
│ Prefers SMS            │  ← Context hints (unchanged)
│ Usually responds in 2h │
└─────────────────────────┘
```

### 6.3 Visible Concepts Reduction

**Before:**
1. Insights
2. Suggested Actions
3. Business Advisor
4. Business Health
5. Today's Snapshot
6. Customer Indicators
7. Messaging Context Hints

**After:**
1. Focus
2. Customer Indicators (supporting context)
3. Messaging Context Hints (supporting context)
4. Today's Metrics (supporting context)

**Reduction:** 7 concepts → 4 concepts
- 3 concepts removed (Insights, Suggested Actions, Business Advisor, Business Health, Today's Snapshot)
- 3 concepts repurposed as supporting context (Customer Indicators, Messaging Hints, Today's Metrics)
- 1 new unified concept (Focus)

---

## 7. Implementation Phases

### Phase 1: Focus Service (Week 1)
- Create Focus type definitions
- Implement FocusService
- Create mapping functions for existing systems
- Implement context-aware filtering
- Implement priority sorting
- Implement quality gates

### Phase 2: Focus UI Components (Week 2)
- Create FocusSection component
- Create FocusCard component
- Implement unified card design
- Add category badges
- Add priority indicators

### Phase 3: Dashboard Migration (Week 3)
- Replace DashboardInsights with FocusSection
- Replace DashboardSuggestedActions with FocusSection
- Keep Today's Snapshot as supporting context (rename to Today's Metrics)
- Test dashboard experience

### Phase 4: Customer Detail Migration (Week 4)
- Replace CustomerInsights with FocusSection
- Replace CustomerSuggestedActions with FocusSection
- Keep customer indicators as supporting context
- Test customer detail experience

### Phase 5: Advisor Integration (Week 5)
- Implement advisor generators as Focus generators
- Integrate advisor recommendations into Focus
- Test advisor integration

### Phase 6: Trend Integration (Week 6)
- Implement trend tracker as Focus generator
- Integrate business trends into Focus
- Test trend integration

### Phase 7: Event Watcher Integration (Week 7)
- Implement event watchers as Focus generators
- Integrate event recommendations into Focus
- Test event watcher integration

### Phase 8: Polish & Launch (Week 8)
- Refine focus item prioritization
- Tune confidence thresholds
- Test all contexts
- Launch unified Focus experience

---

## 8. Preserved Architecture

### 8.1 Keep Internal

**All internal systems remain unchanged:**
- Business Memory service
- Insight generators
- Suggested action generators
- Advisor generators (when implemented)
- Trend tracker (when implemented)
- Event watchers (when implemented)
- Outcome tracking
- Quality validation

### 8.2 Add Abstraction Layer

**New layer only:**
- FocusService (orchestration)
- Focus type definitions (unified interface)
- Mapping functions (translation layer)

### 8.3 Deprecate UI Components

**Deprecate (not delete):**
- DashboardInsights.tsx → Mark as deprecated
- DashboardSuggestedActions.tsx → Mark as deprecated
- CustomerInsights.tsx → Mark as deprecated
- CustomerSuggestedActions.tsx → Mark as deprecated
- TodaySnapshot.tsx → Rename to TodayMetrics.tsx

**Rationale:** Keep for rollback, but mark as deprecated for future cleanup.

---

## 9. Benefits

### 9.1 User Experience

**Simplified:**
- One concept to understand: Focus
- One place to look for intelligence
- Consistent UI pattern everywhere

**Clear:**
- "What matters most right now" is explicit
- Priority is visible
- Evidence is always shown

**Actionable:**
- Every item has a clear action
- No confusion between observation and action

### 9.2 Technical

**Maintainable:**
- Single orchestration point
- Consistent quality gates
- Easier to add new intelligence sources

**Extensible:**
- New systems become Focus generators
- No new UI concepts needed
- Plugs into existing architecture

**Testable:**
- Single service to test
- Clear interfaces
- Isolated mapping functions

---

## 10. Risks & Mitigations

### 10.1 Risk: User Confusion During Transition

**Mitigation:**
- Gradual rollout (phase by phase)
- Keep old components during transition
- Clear documentation
- User education

### 10.2 Risk: Loss of Granularity

**Mitigation:**
- Preserve source field in FocusItem
- Allow filtering by source if needed
- Keep internal systems intact

### 10.3 Risk: Performance Degradation

**Mitigation:**
- Cache Focus items (5 minutes)
- Lazy load Focus generators
- Batch database queries
- Optimize sorting and filtering

---

## 11. Summary

### 11.1 Current State

- **7 visible intelligence concepts** scattered across UI
- Fragmented user experience
- Overlapping functionality (Insights vs Suggested Actions)
- Cognitive load on users

### 11.2 Proposed State

- **1 unified concept:** Focus
- **3 supporting context concepts:** Customer Indicators, Messaging Hints, Today's Metrics
- Consistent UI pattern
- Clear priority and evidence
- All intelligence in one place

### 11.3 Architecture Impact

- **Preserve:** All internal systems (Business Memory, Insight generators, etc.)
- **Add:** FocusService as orchestration layer
- **Deprecate:** Separate UI components (Insights, Suggested Actions)
- **Unify:** Under Focus concept

### 11.4 Guiding Principle Achieved

**One intelligent system. Many internal components. One simple experience.**

The internal architecture remains sophisticated and modular. The user experience becomes simple and unified. Users see Focus, not the complexity behind it.

---

## 12. Recommendation

**Proceed with Focus unification.**

The benefits of a unified intelligence experience significantly outweigh the implementation effort. The architecture is designed to preserve all existing systems while adding a clean abstraction layer. The phased rollout minimizes risk and allows for iterative refinement.

**Next Step:** Begin Phase 1 - Focus Service implementation.
