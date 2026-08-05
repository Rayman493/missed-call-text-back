# Proactive Business Assistant - Implementation Report

## Executive Summary

This report outlines the architecture for transforming ReplyFlow from reactive to proactive software. The system will surface opportunities and risks before they become issues, using the existing Business Memory intelligence platform without adding AI branding, new workflows, or automated actions.

The goal: Make ReplyFlow feel like an experienced office manager quietly watching the business instead of software waiting for user input.

---

## 1. Event Watcher Architecture

### 1.1 Design Principles

- **Lightweight**: Minimal overhead, runs on existing data queries
- **Declarative**: Event conditions defined as rules, not code
- **Business-Driven**: Events map to meaningful business states
- **Feed Existing Insights**: Events enhance current insight generators

### 1.2 Watcher Layer Structure

```
src/lib/watchers/
  ├── event-types.ts           # Business event type definitions
  ├── watcher-registry.ts      # Central registry of all watchers
  ├── watchers/
  │   ├── payment-overdue-watcher.ts
  │   ├── customer-wait-time-watcher.ts
  │   ├── appointment-approaching-watcher.ts
  │   ├── job-overdue-watcher.ts
  │   ├── invoice-ready-watcher.ts
  │   ├── estimate-awaiting-watcher.ts
  │   ├── customer-inactive-watcher.ts
  │   └── repeat-customer-watcher.ts
  └── event-emitter.ts         # Emit events to insight generators
```

### 1.3 Event Type Definitions

```typescript
// src/lib/watchers/event-types.ts

export enum BusinessEventType {
  PAYMENT_OVERDETECTED = 'PaymentOverdueDetected',
  CUSTOMER_NEEDS_FOLLOW_UP = 'CustomerNeedsFollowUp',
  APPOINTMENT_STARTING_SOON = 'AppointmentStartingSoon',
  JOB_BECOMING_OVERDUE = 'JobBecomingOverdue',
  INVOICE_READY_TO_SEND = 'InvoiceReadyToSend',
  ESTIMATE_AWAITING_RESPONSE = 'EstimateAwaitingResponse',
  CUSTOMER_BECOMING_INACTIVE = 'CustomerBecomingInactive',
  REPEAT_CUSTOMER_OPPORTUNITY = 'RepeatCustomerOpportunity',
}

export interface BusinessEvent {
  type: BusinessEventType
  businessId: string
  customerId?: string
  jobId?: string
  invoiceId?: string
  timestamp: Date
  data: Record<string, any>
  priority: 'low' | 'medium' | 'high'
}
```

### 1.4 Watcher Interface

```typescript
// src/lib/watchers/watcher-registry.ts

export interface EventWatcher {
  name: string
  eventType: BusinessEventType
  checkInterval: number // milliseconds
  evaluate(businessId: string): Promise<BusinessEvent[]>
  shouldEvaluate(businessId: string): boolean // Guard conditions
}

export class WatcherRegistry {
  private watchers: Map<string, EventWatcher> = new Map()
  
  register(watcher: EventWatcher): void
  unregister(name: string): void
  evaluateAll(businessId: string): Promise<BusinessEvent[]>
  evaluateWatcher(name: string, businessId: string): Promise<BusinessEvent[]>
}
```

### 1.5 Example Watcher Implementation

```typescript
// src/lib/watchers/watchers/payment-overdue-watcher.ts

export const paymentOverdueWatcher: EventWatcher = {
  name: 'payment-overdue',
  eventType: BusinessEventType.PAYMENT_OVERDETECTED,
  checkInterval: 15 * 60 * 1000, // 15 minutes
  
  shouldEvaluate(businessId: string): boolean {
    // Only evaluate if business has payment requests
    return true
  },
  
  async evaluate(businessId: string): Promise<BusinessEvent[]> {
    const overduePayments = await getOverduePayments(businessId)
    
    return overduePayments.map(payment => ({
      type: BusinessEventType.PAYMENT_OVERDETECTED,
      businessId,
      customerId: payment.customerId,
      invoiceId: payment.invoiceId,
      timestamp: new Date(),
      data: {
        paymentAmount: payment.amount,
        daysOverdue: payment.daysOverdue,
        customerName: payment.customerName,
      },
      priority: payment.daysOverdue > 7 ? 'high' : 'medium',
    }))
  },
}
```

### 1.6 Event Emitter

```typescript
// src/lib/watchers/event-emitter.ts

export class EventEmitter {
  private listeners: Map<BusinessEventType, Set<EventListener>> = new Map()
  
  subscribe(eventType: BusinessEventType, listener: EventListener): void
  unsubscribe(eventType: BusinessEventType, listener: EventListener): void
  emit(event: BusinessEvent): void
  emitBatch(events: BusinessEvent[]): void
}

// Events feed into existing insight generators
// Payment events → payment-insights.ts
// Customer events → customer-preference-insights.ts
// Appointment events → scheduling-insights.ts
```

### 1.7 Integration with Business Memory

Watchers use Business Memory for intelligent evaluation:

```typescript
// Example: Repeat Customer Opportunity
export const repeatCustomerWatcher: EventWatcher = {
  async evaluate(businessId: string): Promise<BusinessEvent[]> {
    const customers = await getActiveCustomers(businessId)
    const events: BusinessEvent[] = []
    
    for (const customer of customers) {
      const memory = memoryService.getCustomerMemory(businessId, customer.id)
      
      if (memory?.repeatCustomer && 
          memory.repeatCustomerProvenance?.confidence >= 70) {
        const lastJobDate = memory.lastJobDate
        const daysSinceLastJob = daysBetween(lastJobDate, new Date())
        
        // Suggest follow-up if repeat customer hasn't booked in 30+ days
        if (daysSinceLastJob > 30) {
          events.push({
            type: BusinessEventType.REPEAT_CUSTOMER_OPPORTUNITY,
            businessId,
            customerId: customer.id,
            timestamp: new Date(),
            data: {
              customerName: customer.name,
              daysSinceLastJob,
              lifetimeRevenue: memory.lifetimeRevenue,
            },
            priority: 'medium',
          })
        }
      }
    }
    
    return events
  },
}
```

---

## 2. Recommendation Lifecycle Management

### 2.1 Lifecycle States

```
Generated → Evaluated → Shown → Dismissed/Acted → Expired
```

### 2.2 Recommendation Schema

```typescript
// src/lib/recommendations/recommendation-types.ts

export enum RecommendationStatus {
  GENERATED = 'generated',
  EVALUATED = 'evaluated',
  SHOWN = 'shown',
  DISMISSED = 'dismissed',
  ACTED_UPON = 'acted_upon',
  EXPIRED = 'expired',
}

export interface Recommendation {
  id: string
  businessId: string
  customerId?: string
  type: string // e.g., "follow-up-reminder", "payment-collection"
  title: string
  description: string
  whyNow: string // Answers "Why now?"
  confidence: number // 0-100
  priority: 'low' | 'medium' | 'high'
  
  // Temporal metadata
  generatedAt: Date
  lastEvaluated: Date
  expiresAt: Date
  
  // Source tracking
  sourceEvent?: BusinessEvent
  sourceMemoryFields?: string[] // Business Memory fields used
  
  // State
  status: RecommendationStatus
  dismissedAt?: Date
  actedUponAt?: Date
  
  // Cooldown tracking
  cooldownUntil?: Date
  dismissalCount: number
}
```

### 2.3 Recommendation Manager

```typescript
// src/lib/recommendations/recommendation-manager.ts

export class RecommendationManager {
  private cache: Map<string, Recommendation[]> = new Map()
  private emitter: EventEmitter
  
  // Generate recommendations from events
  generateFromEvents(events: BusinessEvent[]): Recommendation[]
  
  // Evaluate relevance
  evaluate(recommendation: Recommendation): boolean
  
  // Check if should show
  shouldShow(recommendation: Recommendation): boolean
  
  // Mark as shown
  markShown(recommendationId: string): void
  
  // Dismiss recommendation
  dismiss(recommendationId: string, cooldownDuration?: number): void
  
  // Mark as acted upon
  markActedUpon(recommendationId: string): void
  
  // Clean up expired
  cleanupExpired(): void
}
```

### 2.4 Integration with Insight Generators

Recommendations are generated by existing insight generators:

```typescript
// src/lib/insights/generators/payment-insights.ts

export const paymentInsightsGenerator: InsightGenerator = {
  async generate(businessId: string, customerId?: string): Promise<Insight[]> {
    const insights: Insight[] = []
    
    // Use Business Memory
    const memory = customerId 
      ? memoryService.getCustomerMemory(businessId, customerId)
      : null
    
    // Generate insights
    // ...
    
    // Generate recommendations from PaymentOverdueDetected events
    const overdueEvents = await eventEmitter.getEvents(
      businessId,
      BusinessEventType.PAYMENT_OVERDETECTED
    )
    
    for (const event of overdueEvents) {
      const recommendation = recommendationManager.generateFromEvents([event])[0]
      if (recommendation) {
        insights.push({
          type: 'recommendation',
          title: recommendation.title,
          description: recommendation.description,
          whyNow: recommendation.whyNow,
          confidence: recommendation.confidence,
          priority: recommendation.priority,
          recommendationId: recommendation.id,
          // ... other insight fields
        })
      }
    }
    
    return insights
  },
}
```

---

## 3. Cooldown Strategy

### 3.1 Cooldown Policies

```typescript
// src/lib/recommendations/cooldown-policy.ts

export interface CooldownPolicy {
  defaultCooldown: number // milliseconds
  maxDismissals: number
  escalationCooldown: number // after max dismissals
  dataChangeReset: boolean // reset cooldown if underlying data changes
}

export const COOLDOWN_POLICIES: Record<string, CooldownPolicy> = {
  'follow-up-reminder': {
    defaultCooldown: 24 * 60 * 60 * 1000, // 24 hours
    maxDismissals: 3,
    escalationCooldown: 7 * 24 * 60 * 60 * 1000, // 7 days
    dataChangeReset: true,
  },
  'payment-collection': {
    defaultCooldown: 12 * 60 * 60 * 1000, // 12 hours
    maxDismissals: 5,
    escalationCooldown: 3 * 24 * 60 * 60 * 1000, // 3 days
    dataChangeReset: false, // Don't reset, payment still overdue
  },
  'appointment-reminder': {
    defaultCooldown: 2 * 60 * 60 * 1000, // 2 hours
    maxDismissals: 2,
    escalationCooldown: 24 * 60 * 60 * 1000, // 1 day
    dataChangeReset: true,
  },
}
```

### 3.2 Cooldown Manager

```typescript
// src/lib/recommendations/cooldown-manager.ts

export class CooldownManager {
  private cooldowns: Map<string, Date> = new Map()
  
  // Check if recommendation is in cooldown
  isInCooldown(recommendation: Recommendation): boolean {
    if (!recommendation.cooldownUntil) return false
    return new Date() < recommendation.cooldownUntil
  }
  
  // Apply cooldown on dismissal
  applyCooldown(recommendation: Recommendation): void {
    const policy = COOLDOWN_POLICIES[recommendation.type]
    
    let cooldownDuration = policy.defaultCooldown
    
    // Escalate after multiple dismissals
    if (recommendation.dismissalCount >= policy.maxDismissals) {
      cooldownDuration = policy.escalationCooldown
    }
    
    recommendation.cooldownUntil = new Date(Date.now() + cooldownDuration)
    recommendation.dismissalCount++
  }
  
  // Check if data has changed (resets cooldown if policy allows)
  hasDataChanged(recommendation: Recommendation, newData: any): boolean {
    const policy = COOLDOWN_POLICIES[recommendation.type]
    if (!policy.dataChangeReset) return false
    
    // Compare current data with data at generation time
    // Implementation depends on recommendation type
    return false
  }
}
```

### 3.3 Cooldown Storage

```typescript
// src/lib/recommendations/cooldown-store.ts

export class CooldownStore {
  // Store cooldowns in database for persistence
  async saveCooldown(recommendationId: string, cooldownUntil: Date): Promise<void>
  async getCooldown(recommendationId: string): Promise<Date | null>
  async clearCooldown(recommendationId: string): Promise<void>
  
  // Batch operations
  async clearExpiredCooldowns(): Promise<void>
}
```

---

## 4. Freshness Strategy

### 4.1 Temporal Metadata

Every recommendation tracks three timestamps:

```typescript
export interface RecommendationTemporalMetadata {
  generatedAt: Date      // When the recommendation was first created
  lastEvaluated: Date    // When relevance was last checked
  expiresAt: Date        // When recommendation becomes stale
}
```

### 4.2 Expiration Policies

```typescript
// src/lib/recommendations/expiration-policy.ts

export interface ExpirationPolicy {
  maxAge: number // milliseconds
  evaluationInterval: number // milliseconds
  dataChangeInvalidates: boolean
}

export const EXPIRATION_POLICIES: Record<string, ExpirationPolicy> = {
  'follow-up-reminder': {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    evaluationInterval: 4 * 60 * 60 * 1000, // 4 hours
    dataChangeInvalidates: true,
  },
  'payment-collection': {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days (payment stays overdue)
    evaluationInterval: 12 * 60 * 60 * 1000, // 12 hours
    dataChangeInvalidates: false,
  },
  'appointment-reminder': {
    maxAge: 2 * 60 * 60 * 1000, // 2 hours (appointment passes)
    evaluationInterval: 30 * 60 * 1000, // 30 minutes
    dataChangeInvalidates: true,
  },
}
```

### 4.3 Freshness Manager

```typescript
// src/lib/recommendations/freshness-manager.ts

export class FreshnessManager {
  // Check if recommendation is still valid
  isFresh(recommendation: Recommendation): boolean {
    return new Date() < recommendation.expiresAt
  }
  
  // Re-evaluate recommendation
  async reevaluate(recommendation: Recommendation): Promise<boolean> {
    const policy = EXPIRATION_POLICIES[recommendation.type]
    
    // Check if enough time has passed since last evaluation
    const timeSinceEvaluation = Date.now() - recommendation.lastEvaluated.getTime()
    if (timeSinceEvaluation < policy.evaluationInterval) {
      return true // Still within evaluation window
    }
    
    // Re-run recommendation logic
    const stillRelevant = await this.checkRelevance(recommendation)
    
    recommendation.lastEvaluated = new Date()
    
    if (!stillRelevant) {
      recommendation.status = RecommendationStatus.EXPIRED
      return false
    }
    
    // Update expiration
    recommendation.expiresAt = new Date(Date.now() + policy.maxAge)
    return true
  }
  
  // Check if underlying data has changed
  private async checkRelevance(recommendation: Recommendation): Promise<boolean> {
    // Implementation depends on recommendation type
    // For payment collection: check if payment is still overdue
    // For appointment reminder: check if appointment still exists
    // For follow-up: check if customer still exists
    return true
  }
}
```

### 4.4 Automatic Cleanup

```typescript
// src/lib/recommendations/cleanup-scheduler.ts

export class CleanupScheduler {
  // Run every hour to clean up expired recommendations
  async cleanupExpired(): Promise<void> {
    const expired = await recommendationManager.getExpired()
    for (const rec of expired) {
      rec.status = RecommendationStatus.EXPIRED
      await recommendationManager.save(rec)
    }
  }
}
```

---

## 5. Time-Aware Recommendation Prioritization

### 5.1 Time Context

```typescript
// src/lib/context/time-context.ts

export enum TimeOfDay {
  MORNING = 'morning',     // 6am - 12pm
  AFTERNOON = 'afternoon', // 12pm - 6pm
  EVENING = 'evening',     // 6pm - 10pm
  NIGHT = 'night',         // 10pm - 6am
}

export enum DayOfWeek {
  WEEKDAY = 'weekday',
  WEEKEND = 'weekend',
}

export interface TimeContext {
  timeOfDay: TimeOfDay
  dayOfWeek: DayOfWeek
  isBusinessHours: boolean
  isWeekend: boolean
}
```

### 5.2 Time-Aware Priority Adjustment

```typescript
// src/lib/context/time-aware-prioritizer.ts

export class TimeAwarePrioritizer {
  adjustPriority(recommendation: Recommendation, context: TimeContext): number {
    let priorityScore = this.basePriorityScore(recommendation.priority)
    
    // Morning: Focus on today's work
    if (context.timeOfDay === TimeOfDay.MORNING) {
      if (recommendation.type === 'appointment-reminder' || 
          recommendation.type === 'job-overdue') {
        priorityScore += 20
      }
    }
    
    // Afternoon: Focus on appointments and follow-ups
    if (context.timeOfDay === TimeOfDay.AFTERNOON) {
      if (recommendation.type === 'follow-up-reminder' ||
          recommendation.type === 'appointment-reminder') {
        priorityScore += 15
      }
    }
    
    // Evening: Focus on tomorrow's preparation
    if (context.timeOfDay === TimeOfDay.EVENING) {
      if (recommendation.type === 'appointment-reminder' &&
          this.isTomorrow(recommendation.data)) {
        priorityScore += 25
      }
    }
    
    // Weekend: Focus on planning
    if (context.isWeekend) {
      if (recommendation.type === 'follow-up-reminder' ||
          recommendation.type === 'repeat-customer-opportunity') {
        priorityScore += 10
      }
      // Defer urgent operational tasks
      if (recommendation.type === 'payment-collection') {
        priorityScore -= 10
      }
    }
    
    return priorityScore
  }
  
  private basePriorityScore(priority: string): number {
    switch (priority) {
      case 'high': return 80
      case 'medium': return 50
      case 'low': return 20
      default: return 0
    }
  }
}
```

### 5.3 Integration with Insight Generation

```typescript
// src/lib/insights/insights-service.ts

export async function generateInsights(
  businessId: string,
  customerId?: string
): Promise<Insight[]> {
  const timeContext = getTimeContext()
  const insights: Insight[] = []
  
  for (const generator of insightGenerators) {
    const generatorInsights = await generator.generate(businessId, customerId)
    
    // Adjust priority based on time context
    for (const insight of generatorInsights) {
      if (insight.recommendationId) {
        const recommendation = recommendationManager.get(insight.recommendationId)
        if (recommendation) {
          const adjustedScore = timeAwarePrioritizer.adjustPriority(
            recommendation,
            timeContext
          )
          insight.priorityScore = adjustedScore
        }
      }
    }
    
    insights.push(...generatorInsights)
  }
  
  // Sort by adjusted priority
  return insights.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))
}
```

---

## 6. Context-Aware Recommendation Surfacing

### 6.1 Page Context

```typescript
// src/lib/context/page-context.ts

export enum PageContext {
  DASHBOARD = 'dashboard',
  CUSTOMER_DETAIL = 'customer-detail',
  PAYMENTS = 'payments',
  SCHEDULE = 'schedule',
  CUSTOMERS_LIST = 'customers-list',
  SETTINGS = 'settings',
}

export interface Context {
  page: PageContext
  customerId?: string
  businessId: string
  timeContext: TimeContext
}
```

### 6.2 Context-Aware Filtering

```typescript
// src/lib/context/context-filter.ts

export class ContextFilter {
  // Filter recommendations based on current page
  filterForPage(recommendations: Recommendation[], context: Context): Recommendation[] {
    const page = context.page
    
    switch (page) {
      case PageContext.DASHBOARD:
        // Show business-wide priorities
        return recommendations.filter(r => !r.customerId)
      
      case PageContext.CUSTOMER_DETAIL:
        // Show customer-specific recommendations
        return recommendations.filter(r => r.customerId === context.customerId)
      
      case PageContext.PAYMENTS:
        // Show payment-related recommendations
        return recommendations.filter(r => 
          r.type === 'payment-collection' || 
          r.type === 'invoice-ready'
        )
      
      case PageContext.SCHEDULE:
        // Show appointment-related recommendations
        return recommendations.filter(r => 
          r.type === 'appointment-reminder' ||
          r.type === 'job-overdue'
        )
      
      case PageContext.CUSTOMERS_LIST:
        // Show all customer-specific recommendations
        return recommendations.filter(r => r.customerId)
      
      default:
        return recommendations
    }
  }
}
```

### 6.3 Inline Surfacing Components

```typescript
// src/components/recommendations/InlineRecommendation.tsx

export function InlineRecommendation({ 
  recommendation,
  onDismiss,
  onAct 
}: {
  recommendation: Recommendation
  onDismiss: (id: string) => void
  onAct: (id: string) => void
}) {
  return (
    <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-foreground">
            {recommendation.title}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {recommendation.whyNow}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {recommendation.description}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onAct(recommendation.id)}
          className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded"
        >
          {getActionLabel(recommendation.type)}
        </button>
        <button
          onClick={() => onDismiss(recommendation.id)}
          className="text-xs px-2 py-1 bg-muted text-muted-foreground rounded"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
```

### 6.4 Integration with Existing Components

```typescript
// Dashboard - show business-wide recommendations
// src/app/dashboard/page.tsx

const dashboardRecommendations = contextFilter.filterForPage(
  recommendations,
  { page: PageContext.DASHBOARD, businessId }
)

// Customer Detail - show customer-specific recommendations
// src/app/dashboard/leads/[id]/page-client.tsx

const customerRecommendations = contextFilter.filterForPage(
  recommendations,
  { 
    page: PageContext.CUSTOMER_DETAIL, 
    businessId,
    customerId: lead.id 
  }
)

// Payments page - show payment recommendations
// src/app/dashboard/payments/page.tsx

const paymentRecommendations = contextFilter.filterForPage(
  recommendations,
  { page: PageContext.PAYMENTS, businessId }
)
```

---

## 7. Business Moments Celebration System

### 7.1 Moment Types

```typescript
// src/lib/moments/moment-types.ts

export enum MomentType {
  FIRST_PAYMENT_RECEIVED = 'first-payment-received',
  TENTH_JOB_COMPLETED = 'tenth-job-completed',
  HUNDREDTH_CUSTOMER = 'hundredth-customer',
  REPEAT_CUSTOMER_RETURNED = 'repeat-customer-returned',
  BEST_REVENUE_WEEK = 'best-revenue-week',
  CUSTOMER_MILESTONE = 'customer-milestone', // 10 jobs, $10k revenue, etc.
}

export interface BusinessMoment {
  id: string
  businessId: string
  customerId?: string
  type: MomentType
  title: string
  message: string
  timestamp: Date
  acknowledged: boolean
}
```

### 7.2 Moment Detection

```typescript
// src/lib/moments/moment-detector.ts

export class MomentDetector {
  // Detect first payment
  async detectFirstPayment(businessId: string): Promise<BusinessMoment | null> {
    const paymentCount = await getPaymentCount(businessId)
    if (paymentCount === 1) {
      return {
        id: generateId(),
        businessId,
        type: MomentType.FIRST_PAYMENT_RECEIVED,
        title: 'First Payment Received!',
        message: 'Congratulations on receiving your first payment through ReplyFlow.',
        timestamp: new Date(),
        acknowledged: false,
      }
    }
    return null
  }
  
  // Detect 10th job completed
  async detectTenthJob(businessId: string): Promise<BusinessMoment | null> {
    const completedJobCount = await getCompletedJobCount(businessId)
    if (completedJobCount === 10) {
      return {
        id: generateId(),
        businessId,
        type: MomentType.TENTH_JOB_COMPLETED,
        title: '10 Jobs Completed!',
        message: 'You\'ve completed 10 jobs. Great momentum!',
        timestamp: new Date(),
        acknowledged: false,
      }
    }
    return null
  }
  
  // Detect repeat customer return
  async detectRepeatCustomerReturn(
    businessId: string,
    customerId: string
  ): Promise<BusinessMoment | null> {
    const memory = memoryService.getCustomerMemory(businessId, customerId)
    
    if (memory?.repeatCustomer && 
        memory.repeatCustomerProvenance?.confidence >= 70) {
      const jobCount = memory.jobCount
      if (jobCount === 2) {
        return {
          id: generateId(),
          businessId,
          customerId,
          type: MomentType.REPEAT_CUSTOMER_RETURNED,
          title: 'Repeat Customer!',
          message: `${memory.customerName} has returned for a second job.`,
          timestamp: new Date(),
          acknowledged: false,
        }
      }
    }
    return null
  }
}
```

### 7.3 Moment Display

```typescript
// src/components/moments/MomentBanner.tsx

export function MomentBanner({ 
  moment,
  onAcknowledge 
}: {
  moment: BusinessMoment
  onAcknowledge: (id: string) => void
}) {
  return (
    <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {moment.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {moment.message}
          </p>
        </div>
        <button
          onClick={() => onAcknowledge(moment.id)}
          className="text-xs px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Thanks
        </button>
      </div>
    </div>
  )
}
```

### 7.4 Subtle Celebration

Moments are displayed:
- On the dashboard (business-wide moments)
- On customer detail pages (customer-specific moments)
- With minimal animation (fade in, no bounce)
- Without sound or intrusive effects
- Acknowledged moments are not shown again

---

## 8. Recommendation Quality Assurance

### 8.1 "Why Now?" Requirement

Every recommendation must include a clear `whyNow` field that answers the question: "Why show this recommendation now?"

```typescript
export interface Recommendation {
  // ...
  whyNow: string // Required field
  // Examples:
  // "Payment is 5 days overdue"
  // "Customer hasn't responded in 48 hours"
  // "Appointment starts in 2 hours"
  // "Repeat customer hasn't booked in 30 days"
}
```

### 8.2 Quality Checklist

Before a recommendation is shown, it must pass:

```typescript
// src/lib/recommendations/quality-check.ts

export class QualityCheck {
  validate(recommendation: Recommendation): { valid: boolean; reason?: string } {
    // 1. Must have whyNow
    if (!recommendation.whyNow || recommendation.whyNow.trim() === '') {
      return { valid: false, reason: 'Missing whyNow' }
    }
    
    // 2. Must have confidence >= 70
    if (recommendation.confidence < 70) {
      return { valid: false, reason: 'Confidence too low' }
    }
    
    // 3. Must not be in cooldown
    if (cooldownManager.isInCooldown(recommendation)) {
      return { valid: false, reason: 'In cooldown' }
    }
    
    // 4. Must be fresh
    if (!freshnessManager.isFresh(recommendation)) {
      return { valid: false, reason: 'Expired' }
    }
    
    // 5. Must not be dismissed too many times
    const policy = COOLDOWN_POLICIES[recommendation.type]
    if (recommendation.dismissalCount >= policy.maxDismissals) {
      return { valid: false, reason: 'Too many dismissals' }
    }
    
    // 6. Must be relevant to current context
    if (!this.isRelevantToContext(recommendation)) {
      return { valid: false, reason: 'Not relevant to context' }
    }
    
    return { valid: true }
  }
  
  private isRelevantToContext(recommendation: Recommendation): boolean {
    // Check if recommendation matches current page context
    const context = getCurrentContext()
    const filtered = contextFilter.filterForPage([recommendation], context)
    return filtered.length > 0
  }
}
```

### 8.3 Recommendation Generator Validation

```typescript
// src/lib/recommendations/recommendation-generator.ts

export class RecommendationGenerator {
  generateFromEvent(event: BusinessEvent): Recommendation | null {
    const recommendation = this.buildRecommendation(event)
    
    if (!recommendation) return null
    
    // Validate quality
    const check = qualityCheck.validate(recommendation)
    if (!check.valid) {
      console.log(`[Recommendation] Rejected: ${check.reason}`, recommendation)
      return null
    }
    
    return recommendation
  }
  
  private buildRecommendation(event: BusinessEvent): Recommendation | null {
    switch (event.type) {
      case BusinessEventType.PAYMENT_OVERDETECTED:
        return {
          id: generateId(),
          businessId: event.businessId,
          customerId: event.customerId,
          type: 'payment-collection',
          title: 'Payment Overdue',
          description: `Payment of ${formatCurrency(event.data.paymentAmount)} is overdue.`,
          whyNow: `Payment is ${event.data.daysOverdue} days overdue`,
          confidence: 90,
          priority: event.data.daysOverdue > 7 ? 'high' : 'medium',
          generatedAt: new Date(),
          lastEvaluated: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          sourceEvent: event,
          status: RecommendationStatus.GENERATED,
          dismissalCount: 0,
        }
      
      // ... other event types
    }
  }
}
```

---

## 9. Future Extension Points

### 9.1 Channel Abstraction

The recommendation system is designed to support multiple delivery channels without redesign:

```typescript
// src/lib/recommendations/channel-adapter.ts

export enum Channel {
  INLINE = 'inline',           // Current: inline in UI
  EMAIL_DIGEST = 'email-digest', // Future: daily email
  PUSH_NOTIFICATION = 'push',  // Future: push notifications
  WIDGET = 'widget',           // Future: dashboard widgets
  VOICE_ASSISTANT = 'voice',   // Future: voice assistant
}

export interface ChannelAdapter {
  channel: Channel
  send(recommendations: Recommendation[]): Promise<void>
}
```

### 9.2 Email Digest Extension

```typescript
// src/lib/channels/email-digest-adapter.ts

export class EmailDigestAdapter implements ChannelAdapter {
  channel = Channel.EMAIL_DIGEST
  
  async send(recommendations: Recommendation[]): Promise<void> {
    // Group by business
    const byBusiness = groupBy(recommendations, r => r.businessId)
    
    for (const [businessId, recs] of Object.entries(byBusiness)) {
      const business = await getBusiness(businessId)
      const user = await getUser(business.userId)
      
      // Send daily digest email
      await sendEmail({
        to: user.email,
        subject: 'Daily Briefing - ReplyFlow',
        template: 'daily-digest',
        data: {
          recommendations: recs,
          businessName: business.name,
        },
      })
    }
  }
}
```

### 9.3 Push Notification Extension

```typescript
// src/lib/channels/push-notification-adapter.ts

export class PushNotificationAdapter implements ChannelAdapter {
  channel = Channel.PUSH_NOTIFICATION
  
  async send(recommendations: Recommendation[]): Promise<void> {
    for (const rec of recommendations) {
      if (rec.priority === 'high') {
        // Only send push for high-priority recommendations
        await sendPushNotification({
          userId: rec.businessId,
          title: rec.title,
          body: rec.description,
          data: {
            recommendationId: rec.id,
            type: rec.type,
          },
        })
      }
    }
  }
}
```

### 9.4 Widget Extension

```typescript
// src/lib/channels/widget-adapter.ts

export class WidgetAdapter implements ChannelAdapter {
  channel = Channel.WIDGET
  
  async send(recommendations: Recommendation[]): Promise<void> {
    // Expose recommendations via API for dashboard widgets
    // Widgets can be embedded in external dashboards
    await widgetService.updateWidgetData(recommendations)
  }
}
```

### 9.5 Voice Assistant Extension

```typescript
// src/lib/channels/voice-assistant-adapter.ts

export class VoiceAssistantAdapter implements ChannelAdapter {
  channel = Channel.VOICE_ASSISTANT
  
  async send(recommendations: Recommendation[]): Promise<void> {
    // Convert recommendations to voice-friendly format
    const voiceData = recommendations.map(rec => ({
      summary: rec.title,
      detail: rec.whyNow,
      action: getActionLabel(rec.type),
    }))
    
    await voiceAssistantService.updateDailyBriefing(voiceData)
  }
}
```

### 9.6 Channel Configuration

```typescript
// src/lib/recommendations/channel-config.ts

export interface ChannelConfig {
  enabled: boolean
  frequency: number // milliseconds
  priorityThreshold: 'low' | 'medium' | 'high'
  maxPerBatch: number
}

export const CHANNEL_CONFIGS: Record<Channel, ChannelConfig> = {
  [Channel.INLINE]: {
    enabled: true,
    frequency: 0, // Real-time
    priorityThreshold: 'low',
    maxPerBatch: 5,
  },
  [Channel.EMAIL_DIGEST]: {
    enabled: false, // Disabled until enabled
    frequency: 24 * 60 * 60 * 1000, // Daily
    priorityThreshold: 'medium',
    maxPerBatch: 10,
  },
  [Channel.PUSH_NOTIFICATION]: {
    enabled: false,
    frequency: 60 * 60 * 1000, // Hourly
    priorityThreshold: 'high',
    maxPerBatch: 3,
  },
  [Channel.WIDGET]: {
    enabled: false,
    frequency: 15 * 60 * 1000, // 15 minutes
    priorityThreshold: 'low',
    maxPerBatch: 20,
  },
  [Channel.VOICE_ASSISTANT]: {
    enabled: false,
    frequency: 24 * 60 * 60 * 1000, // Daily
    priorityThreshold: 'medium',
    maxPerBatch: 5,
  },
}
```

---

## 10. Implementation Phases

### Phase 1: Event Watcher Foundation (Week 1)
- Create event type definitions
- Implement watcher registry
- Build first 3 watchers (payment overdue, customer wait time, appointment approaching)
- Integrate with existing insight generators

### Phase 2: Recommendation Lifecycle (Week 2)
- Implement recommendation manager
- Add temporal metadata tracking
- Build cooldown manager
- Add quality validation

### Phase 3: Time & Context Awareness (Week 3)
- Implement time context detection
- Build time-aware prioritization
- Add page context filtering
- Update UI components for inline surfacing

### Phase 4: Business Moments (Week 4)
- Implement moment detector
- Add moment display components
- Track moment acknowledgments

### Phase 5: Testing & Refinement (Week 5)
- Test all recommendation flows
- Tune cooldown policies
- Adjust expiration policies
- Validate "why now" quality

### Phase 6: Future Extensions (Post-Launch)
- Enable email digest channel
- Enable push notification channel
- Add widget support
- Add voice assistant support

---

## 11. Database Schema Changes

### 11.1 Recommendations Table

```sql
CREATE TABLE recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  why_now TEXT NOT NULL,
  confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
  
  -- Temporal metadata
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_evaluated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- State
  status VARCHAR(50) NOT NULL DEFAULT 'generated',
  dismissed_at TIMESTAMPTZ,
  acted_upon_at TIMESTAMPTZ,
  
  -- Cooldown tracking
  cooldown_until TIMESTAMPTZ,
  dismissal_count INTEGER NOT NULL DEFAULT 0,
  
  -- Source tracking
  source_event_id UUID,
  source_memory_fields JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recommendations_business_id ON recommendations(business_id);
CREATE INDEX idx_recommendations_customer_id ON recommendations(customer_id);
CREATE INDEX idx_recommendations_status ON recommendations(status);
CREATE INDEX idx_recommendations_expires_at ON recommendations(expires_at);
CREATE INDEX idx_recommendations_cooldown_until ON recommendations(cooldown_until);
```

### 11.2 Business Moments Table

```sql
CREATE TABLE business_moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_business_moments_business_id ON business_moments(business_id);
CREATE INDEX idx_business_moments_acknowledged ON business_moments(acknowledged);
```

---

## 12. Performance Considerations

### 12.1 Watcher Evaluation Frequency

- Payment overdue: 15 minutes
- Customer wait time: 30 minutes
- Appointment approaching: 5 minutes
- Job overdue: 1 hour
- Invoice ready: 1 hour
- Estimate awaiting: 2 hours
- Customer inactive: 1 day
- Repeat customer: 1 day

### 12.2 Caching Strategy

- Recommendation cache: 5 minutes
- Business Memory cache: 5 minutes (existing)
- Event cache: 1 minute
- Context cache: 1 minute

### 12.3 Database Optimization

- Indexes on recommendation status, expires_at, cooldown_until
- Partition recommendations by business_id for large deployments
- Archive expired recommendations after 90 days

---

## 13. Monitoring & Observability

### 13.1 Metrics to Track

- Recommendations generated per day
- Recommendations shown per day
- Recommendations dismissed vs. acted upon
- Average dismissal count per recommendation type
- Cooldown hit rate
- Expiration rate
- Time from generation to action

### 13.2 Logging

- All watcher evaluations
- All recommendation generations
- All dismissals with reason
- All quality check failures
- All cooldown applications

---

## 14. Summary

The Proactive Business Assistant architecture transforms ReplyFlow from reactive to proactive by:

1. **Event Watchers** - Detect business events before they become issues
2. **Recommendation Lifecycle** - Manage recommendations from generation to expiration
3. **Cooldown Strategy** - Prevent recommendation fatigue with smart cooldowns
4. **Freshness Strategy** - Ensure recommendations are always relevant
5. **Time Awareness** - Adjust priorities based on time of day
6. **Context Awareness** - Surface relevant recommendations per page
7. **Quiet Recommendations** - Inline surfacing without interruptions
8. **Business Moments** - Celebrate milestones subtly
9. **Quality Assurance** - Every recommendation answers "why now?"
10. **Future Ready** - Channel abstraction for email, push, widgets, voice

The system uses the existing Business Memory intelligence platform without adding AI branding, new workflows, or automated actions. Users will simply feel like ReplyFlow is paying attention.
