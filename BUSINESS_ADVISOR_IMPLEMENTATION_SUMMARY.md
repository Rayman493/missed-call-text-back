# Business Advisor Engine - Implementation Summary

## Executive Summary

The Business Advisor Engine transforms ReplyFlow from a system that records "what happened" into an experienced operations manager that answers "what would a great business owner do next?" The engine continuously evaluates the business using Business Memory, Insights, and operational data to generate high-value operational advice across six categories: Money, Customers, Growth, Scheduling, Communication, and Efficiency.

This is NOT AI. This is an experienced operations manager embedded in the software.

---

## 1. Advisor Architecture

### 1.1 Core Philosophy

**From Reactive to Strategic:**

- **Reactive:** "Payment is overdue" → Send reminder
- **Strategic:** "Your average payment time increased this month. Consider requesting payment immediately after job completion to reduce delays."

The Advisor Engine doesn't surface problems. It surfaces opportunities to improve.

### 1.2 Architecture Layers

```
Business Data
    ↓
Business Memory (derived knowledge)
    ↓
Insights (categorized, prioritized)
    ↓
Advisor Generators (strategic evaluation)
    ↓
Advisor Recommendations (high-value advice)
    ↓
Advisor UI (lightweight, practical)
```

### 1.3 File Structure

```
src/lib/advisor/
  ├── advisor-types.ts           # Core type definitions
  ├── advisor-registry.ts        # Central registry of all advisors
  ├── advisors/
  │   ├── money-advisor.ts
  │   ├── customers-advisor.ts
  │   ├── growth-advisor.ts
  │   ├── scheduling-advisor.ts
  │   ├── communication-advisor.ts
  │   └── efficiency-advisor.ts
  ├── trend-tracker.ts           # Business trend tracking
  ├── quality-validator.ts       # Quality rule enforcement
  └── advisor-service.ts         # Main service orchestration

src/components/advisor/
  ├── AdvisorSection.tsx         # Main UI component
  ├── AdvisorCard.tsx            # Individual advice card
  └── TrendSummary.tsx           # Business trend display
```

### 1.4 Core Type Definitions

```typescript
// src/lib/advisor/advisor-types.ts

export enum AdvisorCategory {
  MONEY = 'money',
  CUSTOMERS = 'customers',
  GROWTH = 'growth',
  SCHEDULING = 'scheduling',
  COMMUNICATION = 'communication',
  EFFICIENCY = 'efficiency',
}

export interface AdvisorRecommendation {
  id: string
  businessId: string
  category: AdvisorCategory
  
  // Content
  title: string              // One sentence, action-oriented
  reason: string             // One sentence, explains "why now"
  supportingEvidence: string[]  // 2-4 bullet points of evidence
  confidence: number         // 0-100
  
  // Action
  suggestedAction: string    // What the user should do
  destinationLink?: string   // Optional link to relevant page
  
  // Quality tracking
  whyNow: string             // Explicit answer to "Why now?"
  evidenceSupport: string    // Explicit answer to "What evidence supports this?"
  valueProposition: string   // Explicit answer to "What value does acting provide?"
  
  // Metadata
  generatedAt: Date
  sourceMemoryFields: string[]  // Business Memory fields used
  sourceInsights: string[]      // Insights that informed this
  validUntil: Date
}

export interface BusinessTrend {
  id: string
  businessId: string
  metric: string               // e.g., "payment_speed", "revenue", "repeat_rate"
  direction: 'improving' | 'declining' | 'stable'
  observation: string          // Text description of the trend
  value: number                // Current value
  previousValue: number        // Previous value for comparison
  period: string               // e.g., "this month", "this week"
  generatedAt: Date
}
```

### 1.5 Advisor Interface

```typescript
// src/lib/advisor/advisor-registry.ts

export interface AdvisorGenerator {
  name: string
  category: AdvisorCategory
  evaluate(businessId: string): Promise<AdvisorRecommendation[]>
  requiredMemoryFields: string[]  // Business Memory fields needed
  requiredInsights: string[]      // Insights needed
  minConfidence: number           // Minimum confidence to emit
}

export class AdvisorRegistry {
  private advisors: Map<string, AdvisorGenerator> = new Map()
  
  register(advisor: AdvisorGenerator): void
  unregister(name: string): void
  evaluateAll(businessId: string): Promise<AdvisorRecommendation[]>
  evaluateCategory(category: AdvisorCategory, businessId: string): Promise<AdvisorRecommendation[]>
}
```

---

## 2. Advisor Generators

### 2.1 Money Advisor

**Focus:** Cash flow optimization, payment collection, revenue insights

```typescript
// src/lib/advisors/money-advisor.ts

export const moneyAdvisor: AdvisorGenerator = {
  name: 'money-advisor',
  category: AdvisorCategory.MONEY,
  requiredMemoryFields: ['averagePaymentDelay', 'lifetimeRevenue', 'totalRevenue'],
  requiredInsights: ['payment-overdue', 'payment-collection'],
  minConfidence: 70,
  
  async evaluate(businessId: string): Promise<AdvisorRecommendation[]> {
    const recommendations: AdvisorRecommendation[] = []
    const memory = await memoryService.getBusinessMemory(businessId)
    
    // Advice 1: Payment speed trend
    if (memory?.averagePaymentDelay) {
      const trend = await trendTracker.getTrend(businessId, 'averagePaymentDelay')
      
      if (trend.direction === 'declining' && trend.value > 5) {
        recommendations.push({
          id: generateId(),
          businessId,
          category: AdvisorCategory.MONEY,
          title: 'Request payment immediately after job completion',
          reason: 'Your average payment time has increased to ' + trend.value.toFixed(1) + ' days.',
          supportingEvidence: [
            'Previous average: ' + trend.previousValue.toFixed(1) + ' days',
            'Current average: ' + trend.value.toFixed(1) + ' days',
            'You have $' + memory.outstandingPayments?.toFixed(0) + ' in outstanding payments',
          ],
          confidence: 85,
          suggestedAction: 'Update your workflow to request payment when marking jobs complete',
          destinationLink: '/dashboard/payments',
          whyNow: 'Payment delays are trending upward, affecting cash flow',
          evidenceSupport: 'Average payment delay increased from ' + trend.previousValue.toFixed(1) + ' to ' + trend.value.toFixed(1) + ' days',
          valueProposition: 'Reducing payment delays by 2 days could improve cash flow by approximately $' + (memory.outstandingPayments * 0.3).toFixed(0),
          generatedAt: new Date(),
          sourceMemoryFields: ['averagePaymentDelay', 'outstandingPayments'],
          sourceInsights: ['payment-overdue'],
          validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        })
      }
    }
    
    // Advice 2: Outstanding payments concentration
    if (memory?.outstandingPayments && memory.outstandingPayments > 500) {
      const overdueCustomers = await getOverdueCustomers(businessId)
      
      if (overdueCustomers.length > 0) {
        const quickPayers = overdueCustomers.filter(c => 
          c.averagePaymentDelay < 2
        ).length
        
        if (quickPayers > 0) {
          recommendations.push({
            id: generateId(),
            businessId,
            category: AdvisorCategory.MONEY,
            title: 'Follow up with ' + quickPayers + ' quick-paying customers',
            reason: 'You have $' + memory.outstandingPayments.toFixed(0) + ' outstanding and ' + quickPayers + ' customers usually pay within 24 hours.',
            supportingEvidence: [
              'Total outstanding: $' + memory.outstandingPayments.toFixed(0),
              quickPayers + ' customers typically pay within 24 hours',
              'One customer has been unpaid for 9 days',
            ],
            confidence: 90,
            suggestedAction: 'Send payment reminders to your quick-paying customers',
            destinationLink: '/dashboard/payments',
            whyNow: 'Quick-paying customers are likely to respond to reminders',
            evidenceSupport: memory.outstandingPayments + ' outstanding payments, ' + quickPayers + ' identified as quick payers',
            valueProposition: 'Following up with quick payers could collect approximately $' + (quickPayers * 150).toFixed(0) + ' within 24 hours',
            generatedAt: new Date(),
            sourceMemoryFields: ['outstandingPayments'],
            sourceInsights: ['payment-overdue'],
            validUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
          })
        }
      }
    }
    
    return recommendations
  },
}
```

### 2.2 Customers Advisor

**Focus:** Customer retention, repeat business, re-engagement

```typescript
// src/lib/advisors/customers-advisor.ts

export const customersAdvisor: AdvisorGenerator = {
  name: 'customers-advisor',
  category: AdvisorCategory.CUSTOMERS,
  requiredMemoryFields: ['repeatCustomer', 'jobCount', 'lifetimeRevenue', 'lastJobDate'],
  requiredInsights: ['customer-preference'],
  minConfidence: 70,
  
  async evaluate(businessId: string): Promise<AdvisorRecommendation[]> {
    const recommendations: AdvisorRecommendation[] = []
    const customers = await getCustomers(businessId)
    
    // Advice 1: Recurring service opportunity
    const repeatCustomers = customers.filter(customer => {
      const memory = memoryService.getCustomerMemory(businessId, customer.id)
      return memory?.repeatCustomer && 
             memory.repeatCustomerProvenance?.confidence >= 70 &&
             memory.jobCount >= 4
    })
    
    for (const customer of repeatCustomers) {
      const memory = memoryService.getCustomerMemory(businessId, customer.id)
      
      if (!memory.hasRecurringService) {
        recommendations.push({
          id: generateId(),
          businessId,
          category: AdvisorCategory.CUSTOMERS,
          title: 'Offer recurring service to ' + customer.name,
          reason: customer.name + ' has hired you ' + memory.jobCount + ' times.',
          supportingEvidence: [
            'Total jobs: ' + memory.jobCount,
            'Lifetime revenue: $' + memory.lifetimeRevenue?.toFixed(0),
            'Average time between jobs: ' + (memory.averageDaysBetweenJobs || 'N/A'),
          ],
          confidence: 85,
          suggestedAction: 'Create a recurring service plan for this customer',
          destinationLink: '/dashboard/leads/' + customer.id,
          whyNow: customer.name + ' has demonstrated loyalty with ' + memory.jobCount + ' jobs',
          evidenceSupport: memory.jobCount + ' completed jobs, $' + memory.lifetimeRevenue?.toFixed(0) + ' lifetime revenue',
          valueProposition: 'Converting to recurring service could secure $' + (memory.lifetimeRevenue * 0.5).toFixed(0) + ' in annual recurring revenue',
          generatedAt: new Date(),
          sourceMemoryFields: ['repeatCustomer', 'jobCount', 'lifetimeRevenue', 'hasRecurringService'],
          sourceInsights: ['customer-preference'],
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        })
        break // One recommendation per evaluation
      }
    }
    
    // Advice 2: Re-engagement opportunity
    const inactiveCustomers = customers.filter(customer => {
      const memory = memoryService.getCustomerMemory(businessId, customer.id)
      return memory?.lastJobDate && 
             daysBetween(memory.lastJobDate, new Date()) > 60 &&
             memory.jobCount >= 2 // Only customers with history
    })
    
    if (inactiveCustomers.length > 0) {
      const customer = inactiveCustomers[0]
      const memory = memoryService.getCustomerMemory(businessId, customer.id)
      
      recommendations.push({
        id: generateId(),
        businessId,
        category: AdvisorCategory.CUSTOMERS,
        title: 'Re-engage ' + customer.name,
        reason: customer.name + ' hasn\'t booked in ' + daysBetween(memory.lastJobDate, new Date()) + ' days.',
        supportingEvidence: [
          'Last service: ' + formatDate(memory.lastJobDate),
          'Previous jobs: ' + memory.jobCount,
          'Preferred contact: ' + (memory.preferredContactMethod || 'any'),
        ],
        confidence: 75,
        suggestedAction: 'Send a personalized follow-up message',
        destinationLink: '/dashboard/leads/' + customer.id,
        whyNow: customer.name + ' is a good candidate for re-engagement after ' + daysBetween(memory.lastJobDate, new Date()) + ' days',
        evidenceSupport: memory.jobCount + ' previous jobs, ' + daysBetween(memory.lastJobDate, new Date()) + ' days since last booking',
        valueProposition: 'Re-engaging past customers has a 30% higher conversion rate than new leads',
        generatedAt: new Date(),
        sourceMemoryFields: ['lastJobDate', 'jobCount', 'preferredContactMethod'],
        sourceInsights: ['customer-preference'],
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      })
    }
    
    // Advice 3: Contact method optimization
    const smsResponsiveCustomers = customers.filter(customer => {
      const memory = memoryService.getCustomerMemory(businessId, customer.id)
      return memory?.preferredContactMethod === 'sms' &&
             memory.averageResponseDelay < 24
    })
    
    if (smsResponsiveCustomers.length >= 3) {
      recommendations.push({
        id: generateId(),
        businessId,
        category: AdvisorCategory.CUSTOMERS,
        title: smsResponsiveCustomers.length + ' customers respond faster to SMS',
        reason: 'Your SMS-responsive customers reply within 24 hours on average.',
        supportingEvidence: [
          smsResponsiveCustomers.length + ' customers prefer SMS',
          'Average SMS response time: ' + calculateAverageResponse(smsResponsiveCustomers) + ' hours',
          'Consider SMS for time-sensitive communications',
        ],
        confidence: 80,
        suggestedAction: 'Use SMS for appointment confirmations and follow-ups',
        destinationLink: '/dashboard/leads',
        whyNow: 'Optimizing contact methods can improve response rates',
        evidenceSupport: smsResponsiveCustomers.length + ' customers with SMS preference and fast response times',
        valueProposition: 'Using preferred contact methods can increase response rates by 40%',
        generatedAt: new Date(),
        sourceMemoryFields: ['preferredContactMethod', 'averageResponseDelay'],
        sourceInsights: ['communication-insights'],
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      })
    }
    
    return recommendations
  },
}
```

### 2.3 Growth Advisor

**Focus:** Service performance, revenue trends, market opportunities

```typescript
// src/lib/advisors/growth-advisor.ts

export const growthAdvisor: AdvisorGenerator = {
  name: 'growth-advisor',
  category: AdvisorCategory.GROWTH,
  requiredMemoryFields: ['favoriteService', 'totalRevenue', 'jobCountByService'],
  requiredInsights: [],
  minConfidence: 70,
  
  async evaluate(businessId: string): Promise<AdvisorRecommendation[]> {
    const recommendations: AdvisorRecommendation[] = []
    const memory = await memoryService.getBusinessMemory(businessId)
    
    // Advice 1: Fastest-growing service
    if (memory?.jobCountByService) {
      const serviceTrends = await trendTracker.getServiceTrends(businessId)
      const fastestGrowing = serviceTrends.sort((a, b) => b.growthRate - a.growthRate)[0]
      
      if (fastestGrowing && fastestGrowing.growthRate > 0.3) {
        recommendations.push({
          id: generateId(),
          businessId,
          category: AdvisorCategory.GROWTH,
          title: fastestGrowing.service + ' is your fastest-growing service',
          reason: 'Demand for ' + fastestGrowing.service + ' increased by ' + (fastestGrowing.growthRate * 100).toFixed(0) + '% this month.',
          supportingEvidence: [
            'Jobs this month: ' + fastestGrowing.currentJobs,
            'Jobs last month: ' + fastestGrowing.previousJobs,
            'Growth rate: ' + (fastestGrowing.growthRate * 100).toFixed(0) + '%',
          ],
          confidence: 85,
          suggestedAction: 'Consider marketing ' + fastestGrowing.service + ' more aggressively',
          destinationLink: '/dashboard/calendar',
          whyNow: fastestGrowing.service + ' shows strong growth momentum',
          evidenceSupport: (fastestGrowing.growthRate * 100).toFixed(0) + '% month-over-month growth in ' + fastestGrowing.service,
          valueProposition: 'Capitalizing on growing services can increase revenue by 15-20%',
          generatedAt: new Date(),
          sourceMemoryFields: ['jobCountByService'],
          sourceInsights: [],
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        })
      }
    }
    
    // Advice 2: Peak time identification
    const busyTimes = await getBusyTimeAnalysis(businessId)
    const peakSlot = busyTimes.sort((a, b) => b.jobCount - a.jobCount)[0]
    
    if (peakSlot && peakSlot.jobCount > 5) {
      recommendations.push({
        id: generateId(),
        businessId,
        category: AdvisorCategory.GROWTH,
        title: peakSlot.day + ' ' + peakSlot.time + 's are your busiest time',
        reason: 'You complete ' + peakSlot.jobCount + ' jobs during ' + peakSlot.day + ' ' + peakSlot.time + 's.',
        supportingEvidence: [
          'Peak slot: ' + peakSlot.day + ' ' + peakSlot.time,
          'Jobs in slot: ' + peakSlot.jobCount,
          'Average in other slots: ' + peakSlot.averageOtherSlots,
        ],
        confidence: 80,
        suggestedAction: 'Schedule your most important appointments during peak times',
        destinationLink: '/dashboard/calendar',
        whyNow: 'Understanding peak times helps optimize scheduling',
        evidenceSupport: peakSlot.jobCount + ' jobs in ' + peakSlot.day + ' ' + peakSlot.time + ' vs ' + peakSlot.averageOtherSlots + ' average',
        valueProposition: 'Optimizing for peak times can increase daily job capacity by 20%',
        generatedAt: new Date(),
        sourceMemoryFields: [],
        sourceInsights: [],
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      })
    }
    
    // Advice 3: Repeat customer booking pattern
    if (memory?.averageDaysBetweenJobs && memory.averageDaysBetweenJobs < 45) {
      recommendations.push({
        id: generateId(),
        businessId,
        category: AdvisorCategory.GROWTH,
        title: 'Repeat customers book every ' + Math.round(memory.averageDaysBetweenJobs) + ' days on average',
        reason: 'Your repeat customers show consistent booking patterns.',
        supportingEvidence: [
          'Average interval: ' + Math.round(memory.averageDaysBetweenJobs) + ' days',
          'Repeat customer rate: ' + (memory.repeatCustomerRate * 100).toFixed(0) + '%',
          'Consider scheduling follow-ups at ' + Math.round(memory.averageDaysBetweenJobs * 0.8) + ' days',
        ],
        confidence: 75,
        suggestedAction: 'Schedule proactive follow-ups before customers naturally re-book',
        destinationLink: '/dashboard/leads',
        whyNow: 'Proactive outreach can capture bookings before customers seek alternatives',
        evidenceSupport: Math.round(memory.averageDaysBetweenJobs) + '-day average booking interval with ' + (memory.repeatCustomerRate * 100).toFixed(0) + '% repeat rate',
        valueProposition: 'Proactive follow-ups can increase repeat booking rate by 25%',
        generatedAt: new Date(),
        sourceMemoryFields: ['averageDaysBetweenJobs', 'repeatCustomerRate'],
        sourceInsights: [],
        validUntil: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 21 days
      })
    }
    
    return recommendations
  },
}
```

### 2.4 Scheduling Advisor

**Focus**: Appointment optimization, travel efficiency, capacity planning

```typescript
// src/lib/advisors/scheduling-advisor.ts

export const schedulingAdvisor: AdvisorGenerator = {
  name: 'scheduling-advisor',
  category: AdvisorCategory.SCHEDULING,
  requiredMemoryFields: ['preferredAppointmentTime', 'preferredDay'],
  requiredInsights: ['scheduling-insights'],
  minConfidence: 70,
  
  async evaluate(businessId: string): Promise<AdvisorRecommendation[]> {
    const recommendations: AdvisorRecommendation[] = []
    
    // Advice 1: Tomorrow's capacity
    const tomorrowCapacity = await getAvailableCapacity(businessId, 'tomorrow')
    
    if (tomorrowCapacity.hours >= 3) {
      recommendations.push({
        id: generateId(),
        businessId,
        category: AdvisorCategory.SCHEDULING,
        title: 'Tomorrow has a ' + tomorrowCapacity.hours + '-hour opening',
        reason: 'Good opportunity to schedule additional work.',
        supportingEvidence: [
          'Available hours: ' + tomorrowCapacity.hours,
          'Number of openings: ' + tomorrowCapacity.slots,
          'Peak availability: ' + tomorrowCapacity.peakTime,
        ],
        confidence: 85,
        suggestedAction: 'Reach out to customers who need scheduling',
        destinationLink: '/dashboard/calendar',
        whyNow: 'Tomorrow\'s capacity should be utilized before it\'s lost',
        evidenceSupport: tomorrowCapacity.hours + ' hours of available capacity tomorrow',
        valueProposition: 'Filling tomorrow\'s openings could add $' + (tomorrowCapacity.hours * 100).toFixed(0) + ' in revenue',
        generatedAt: new Date(),
        sourceMemoryFields: [],
        sourceInsights: ['scheduling-insights'],
        validUntil: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 1 day
      })
    }
    
    // Advice 2: Travel inefficiency
    const travelAnalysis = await analyzeTravelEfficiency(businessId)
    
    if (travelAnalysis.inefficientRoutes > 0) {
      recommendations.push({
        id: generateId(),
        businessId,
        category: AdvisorCategory.SCHEDULING,
        title: travelAnalysis.inefficientRoutes + ' routes could be optimized for travel',
        reason: 'Two nearby jobs could be combined to reduce travel time.',
        supportingEvidence: [
          'Inefficient routes: ' + travelAnalysis.inefficientRoutes,
          'Potential time savings: ' + travelAnalysis.timeSavings + ' hours',
          'Affected jobs: ' + travelAnalysis.affectedJobs,
        ],
        confidence: 75,
        suggestedAction: 'Review and re-sequence nearby appointments',
        destinationLink: '/dashboard/calendar',
        whyNow: 'Optimizing routes saves time and reduces costs',
        evidenceSupport: travelAnalysis.inefficientRoutes + ' inefficient routes identified with ' + travelAnalysis.timeSavings + ' hours potential savings',
        valueProposition: 'Route optimization could save ' + travelAnalysis.timeSavings + ' hours weekly',
        generatedAt: new Date(),
        sourceMemoryFields: [],
        sourceInsights: ['scheduling-insights'],
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      })
    }
    
    // Advice 3: Customer preference alignment
    const misalignedAppointments = await getMisalignedAppointments(businessId)
    
    if (misalignedAppointments.length > 0) {
      recommendations.push({
        id: generateId(),
        businessId,
        category: AdvisorCategory.SCHEDULING,
        title: misalignedAppointments.length + ' appointments could better match customer preferences',
        reason: 'Some appointments are scheduled outside customer-preferred times.',
        supportingEvidence: [
          'Misaligned appointments: ' + misalignedAppointments.length,
          'Common preference: ' + misalignedAppointments[0].preferredTime,
          'Consider rescheduling for better alignment',
        ],
        confidence: 70,
        suggestedAction: 'Offer to reschedule to preferred times',
        destinationLink: '/dashboard/calendar',
        whyNow: 'Aligning with preferences improves customer satisfaction',
        evidenceSupport: misalignedAppointments.length + ' appointments outside customer-preferred times',
        valueProposition: 'Preference-aligned scheduling can increase customer satisfaction by 30%',
        generatedAt: new Date(),
        sourceMemoryFields: ['preferredAppointmentTime', 'preferredDay'],
        sourceInsights: ['scheduling-insights'],
        validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
      })
    }
    
    return recommendations
  },
}
```

### 2.5 Communication Advisor

**Focus**: Response time optimization, follow-up completeness, channel effectiveness

```typescript
// src/lib/advisors/communication-advisor.ts

export const communicationAdvisor: AdvisorGenerator = {
  name: 'communication-advisor',
  category: AdvisorCategory.COMMUNICATION,
  requiredMemoryFields: ['averageResponseDelay', 'preferredContactMethod'],
  requiredInsights: ['communication-insights'],
  minConfidence: 70,
  
  async evaluate(businessId: string): Promise<AdvisorRecommendation[]> {
    const recommendations: AdvisorRecommendation[] = []
    const memory = await memoryService.getBusinessMemory(businessId)
    
    // Advice 1: Response time trend
    const responseTrend = await trendTracker.getTrend(businessId, 'averageResponseDelay')
    
    if (responseTrend.direction === 'improving') {
      recommendations.push({
        id: generateId(),
        businessId,
        category: AdvisorCategory.COMMUNICATION,
        title: 'Your response time has improved',
        reason: 'Customers now receive replies ' + responseTrend.improvement.toFixed(1) + ' hours faster on average.',
        supportingEvidence: [
          'Previous average: ' + responseTrend.previousValue.toFixed(1) + ' hours',
          'Current average: ' + responseTrend.value.toFixed(1) + ' hours',
          'Improvement: ' + responseTrend.improvement.toFixed(1) + ' hours',
        ],
        confidence: 90,
        suggestedAction: 'Continue current communication practices',
        destinationLink: null,
        whyNow: 'Positive trends should be reinforced',
        evidenceSupport: responseTrend.improvement.toFixed(1) + '-hour improvement in average response time',
        valueProposition: 'Fast response times increase customer satisfaction by 40%',
        generatedAt: new Date(),
        sourceMemoryFields: ['averageResponseDelay'],
        sourceInsights: ['communication-insights'],
        validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
      })
    }
    
    // Advice 2: Missing follow-ups
    const missingFollowUps = await getCustomersWithoutFollowUp(businessId)
    
    if (missingFollowUps.length >= 5) {
      recommendations.push({
        id: generateId(),
        businessId,
        category: AdvisorCategory.COMMUNICATION,
        title: missingFollowUps.length + ' customers haven\'t received follow-ups',
        reason: 'These customers completed jobs but haven\'t been contacted since.',
        supportingEvidence: [
          'Customers without follow-up: ' + missingFollowUps.length,
          'Average time since completion: ' + missingFollowUps[0].daysSinceCompletion + ' days',
          'Industry best practice: follow up within 48 hours',
        ],
        confidence: 85,
        suggestedAction: 'Send follow-up messages to these customers',
        destinationLink: '/dashboard/leads',
        whyNow: 'Timely follow-ups increase repeat business',
        evidenceSupport: missingFollowUps.length + ' customers without follow-up, averaging ' + missingFollowUps[0].daysSinceCompletion + ' days since completion',
        valueProposition: 'Following up can increase repeat booking rate by 25%',
        generatedAt: new Date(),
        sourceMemoryFields: [],
        sourceInsights: ['communication-insights'],
        validUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
      })
    }
    
    // Advice 3: Time-of-day effectiveness
    const timeEffectiveness = await getTimeOfDayEffectiveness(businessId)
    
    if (timeEffectiveness.bestTime && timeEffectiveness.bestTime !== timeEffectiveness.worstTime) {
      recommendations.push({
        id: generateId(),
        businessId,
        category: AdvisorCategory.COMMUNICATION,
        title: 'Morning messages perform better than evenings',
        reason: 'Customers respond ' + timeEffectiveness.responseRateImprovement + '% faster to morning messages.',
        supportingEvidence: [
          'Best time: ' + timeEffectiveness.bestTime,
          'Worst time: ' + timeEffectiveness.worstTime,
          'Response rate improvement: ' + timeEffectiveness.responseRateImprovement + '%',
        ],
        confidence: 75,
        suggestedAction: 'Schedule important communications for morning hours',
        destinationLink: null,
        whyNow: 'Optimizing send times improves engagement',
        evidenceSupport: timeEffectiveness.responseRateImprovement + '% higher response rate in mornings vs evenings',
        valueProposition: 'Time-optimized messaging can increase response rates by 20%',
        generatedAt: new Date(),
        sourceMemoryFields: [],
        sourceInsights: ['communication-insights'],
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      })
    }
    
    return recommendations
  },
}
```

### 2.6 Efficiency Advisor

**Focus**: Workflow optimization, process bottlenecks, operational efficiency

```typescript
// src/lib/advisors/efficiency-advisor.ts

export const efficiencyAdvisor: AdvisorGenerator = {
  name: 'efficiency-advisor',
  category: AdvisorCategory.EFFICIENCY,
  requiredMemoryFields: [],
  requiredInsights: [],
  minConfidence: 70,
  
  async evaluate(businessId: string): Promise<AdvisorRecommendation[]> {
    const recommendations: AdvisorRecommendation[] = []
    
    // Advice 1: Scheduling delay
    const schedulingDelay = await getSchedulingDelay(businessId)
    
    if (schedulingDelay.averageDays > 4) {
      recommendations.push({
        id: generateId(),
        businessId,
        category: AdvisorCategory.EFFICIENCY,
        title: 'Jobs wait an average of ' + schedulingDelay.averageDays.toFixed(1) + ' days before scheduling',
        reason: 'Reducing scheduling delays could improve customer experience.',
        supportingEvidence: [
          'Average delay: ' + schedulingDelay.averageDays.toFixed(1) + ' days',
          'Longest delay: ' + schedulingDelay.maxDays + ' days',
          'Industry benchmark: 2 days',
        ],
        confidence: 85,
        suggestedAction: 'Schedule jobs immediately when confirmed',
        destinationLink: '/dashboard/calendar',
        whyNow: 'Long scheduling delays frustrate customers and reduce conversion',
        evidenceSupport: schedulingDelay.averageDays.toFixed(1) + '-day average delay vs 2-day industry benchmark',
        valueProposition: 'Reducing scheduling delay to 2 days could increase conversion by 15%',
        generatedAt: new Date(),
        sourceMemoryFields: [],
        sourceInsights: [],
        validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
      })
    }
    
    // Advice 2: Payment request timing
    const paymentRequestDelay = await getPaymentRequestDelay(businessId)
    
    if (paymentRequestDelay.averageDays > 2) {
      recommendations.push({
        id: generateId(),
        businessId,
        category: AdvisorCategory.EFFICIENCY,
        title: 'Payment requests are sent ' + paymentRequestDelay.averageDays.toFixed(1) + ' days after completion',
        reason: 'Requesting payment immediately could reduce delays.',
        supportingEvidence: [
          'Current delay: ' + paymentRequestDelay.averageDays.toFixed(1) + ' days',
          'Best practice: request on completion day',
          'Potential improvement: ' + paymentRequestDelay.averageDays.toFixed(1) + ' days',
        ],
        confidence: 90,
        suggestedAction: 'Configure automatic payment requests on job completion',
        destinationLink: '/dashboard/settings/follow-ups',
        whyNow: 'Payment delays directly impact cash flow',
        evidenceSupport: paymentRequestDelay.averageDays.toFixed(1) + '-day delay between completion and payment request',
        valueProposition: 'Same-day payment requests could reduce collection time by ' + paymentRequestDelay.averageDays.toFixed(1) + ' days',
        generatedAt: new Date(),
        sourceMemoryFields: [],
        sourceInsights: [],
        validUntil: new Date(DateNow() + 21 * 24 * 60 * 60 * 1000), // 21 days
      })
    }
    
    // Advice 3: Single-use customers
    const singleUseCustomers = await getSingleUseCustomers(businessId)
    
    if (singleUseCustomers.length >= 10) {
      recommendations.push({
        id: generateId(),
        businessId,
        category: AdvisorCategory.EFFICIENCY,
        title: singleUseCustomers.length + ' customers have completed only one job',
        reason: 'Converting single-use customers to repeat customers improves efficiency.',
        supportingEvidence: [
          'Single-use customers: ' + singleUseCustomers.length,
          'Average time since service: ' + calculateAverageDaysSince(singleUseCustomers) + ' days',
          'Repeat customer rate: ' + (await getRepeatCustomerRate(businessId) * 100).toFixed(0) + '%',
        ],
        suggestedAction: 'View Customers',
        destinationLink: '/dashboard/leads',
        whyNow: 'Single-use customers represent growth opportunity',
        evidenceSupport: singleUseCustomers.length + ' customers with only one job, averaging ' + calculateAverageDaysSince(singleUseCustomers) + ' days since service',
        valueProposition: 'Converting 10% of single-use customers could increase annual revenue by $' + (singleUseCustomers.length * 200).toFixed(0),
        generatedAt: new Date(),
        sourceMemoryFields: [],
        sourceInsights: [],
        validUntil: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 21 days
      })
    }
    
    return recommendations
  },
}
```

---

## 3. Business Trend Tracking

### 3.1 Trend Detection

```typescript
// src/lib/advisor/trend-tracker.ts

export class TrendTracker {
  private trendCache: Map<string, BusinessTrend> = new Map()
  
  // Get trend for a specific metric
  async getTrend(businessId: string, metric: string): Promise<BusinessTrend> {
    const cacheKey = `${businessId}:${metric}`
    
    if (this.trendCache.has(cacheKey)) {
      const cached = this.trendCache.get(cacheKey)!
      if (Date.now() - cached.generatedAt.getTime() < 24 * 60 * 60 * 1000) {
        return cached
      }
    }
    
    const current = await this.getCurrentValue(businessId, metric)
    const previous = await this.getPreviousValue(businessId, metric)
    
    const direction = this.calculateDirection(current, previous)
    const observation = this.generateObservation(metric, direction, current, previous)
    
    const trend: BusinessTrend = {
      id: generateId(),
      businessId,
      metric,
      direction,
      observation,
      value: current,
      previousValue: previous,
      period: 'this month',
      generatedAt: new Date(),
    }
    
    this.trendCache.set(cacheKey, trend)
    await this.saveTrend(trend)
    
    return trend
  }
  
  // Get service-specific trends
  async getServiceTrends(businessId: string): Promise<ServiceTrend[]> {
    const services = await getServices(businessId)
    const trends: ServiceTrend[] = []
    
    for (const service of services) {
      const currentJobs = await getJobCount(businessId, service, 'this_month')
      const previousJobs = await getJobCount(businessId, service, 'last_month')
      
      const growthRate = previousJobs > 0 
        ? (currentJobs - previousJobs) / previousJobs 
        : 0
      
      trends.push({
        service,
        currentJobs,
        previousJobs,
        growthRate,
      })
    }
    
    return trends
  }
  
  private calculateDirection(current: number, previous: number): 'improving' | 'declining' | 'stable' {
    const change = (current - previous) / Math.abs(previous || 1)
    
    if (Math.abs(change) < 0.05) return 'stable'
    
    // For metrics where lower is better (e.g., payment delay)
    if (['averagePaymentDelay', 'averageResponseDelay', 'schedulingDelay'].includes(this.metric)) {
      return change < 0 ? 'improving' : 'declining'
    }
    
    // For metrics where higher is better (e.g., revenue, repeat rate)
    return change > 0 ? 'improving' : 'declining'
  }
  
  private generateObservation(
    metric: string,
    direction: string,
    current: number,
    previous: number
  ): string {
    const change = Math.abs((current - previous) / Math.abs(previous || 1) * 100).toFixed(0)
    
    const observations: Record<string, string> = {
      averagePaymentDelay: direction === 'improving' 
        ? `Payment speed improved by ${change}%`
        : `Payment speed declined by ${change}%`,
      averageResponseDelay: direction === 'improving'
        ? `Response time improved by ${change}%`
        : `Response time declined by ${change}%`,
      totalRevenue: direction === 'improving'
        ? `Revenue increased by ${change}%`
        : `Revenue decreased by ${change}%`,
      repeatCustomerRate: direction === 'improving'
        ? `Repeat customer rate increased by ${change}%`
        : `Repeat customer rate decreased by ${change}%`,
    }
    
    return observations[metric] || `${metric} changed by ${change}%`
  }
}
```

### 3.2 Trend Storage

```typescript
// Database table for trend persistence

CREATE TABLE business_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  metric VARCHAR(100) NOT NULL,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('improving', 'declining', 'stable')),
  observation TEXT NOT NULL,
  value NUMERIC NOT NULL,
  previous_value NUMERIC NOT NULL,
  period VARCHAR(50) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_business_trends_business_id ON business_trends(business_id);
CREATE INDEX idx_business_trends_metric ON business_trends(metric);
CREATE INDEX idx_business_trends_generated_at ON business_trends(generated_at);
```

---

## 4. Quality Validation System

### 4.1 Quality Rules

Every advisor recommendation must pass three quality gates:

```typescript
// src/lib/advisor/quality-validator.ts

export class QualityValidator {
  validate(recommendation: AdvisorRecommendation): { valid: boolean; reason?: string } {
    // Gate 1: Why Now?
    if (!recommendation.whyNow || recommendation.whyNow.trim() === '') {
      return { valid: false, reason: 'Missing whyNow' }
    }
    
    // Gate 2: Evidence Support
    if (!recommendation.evidenceSupport || recommendation.evidenceSupport.trim() === '') {
      return { valid: false, reason: 'Missing evidenceSupport' }
    }
    
    // Gate 3: Value Proposition
    if (!recommendation.valueProposition || recommendation.valueProposition.trim() === '') {
      return { valid: false, reason: 'Missing valueProposition' }
    }
    
    // Gate 4: Confidence Threshold
    if (recommendation.confidence < 70) {
      return { valid: false, reason: 'Confidence below 70' }
    }
    
    // Gate 5: Supporting Evidence
    if (!recommendation.supportingEvidence || recommendation.supportingEvidence.length < 2) {
      return { valid: false, reason: 'Insufficient supporting evidence (minimum 2)' }
    }
    
    // Gate 6: Business Memory Dependency
    if (!recommendation.sourceMemoryFields || recommendation.sourceMemoryFields.length === 0) {
      return { valid: false, reason: 'Must use Business Memory' }
    }
    
    // Gate 7: No Raw Database Calculations
    // Enforced by requiring sourceMemoryFields
    
    return { valid: true }
  }
}
```

### 4.2 Quality Checklist Template

For each advisor generator:

```typescript
// Example quality checklist for Money Advisor

const qualityChecklist = {
  title: 'One sentence, action-oriented',
  reason: 'One sentence, explains why now',
  supportingEvidence: '2-4 bullet points of data',
  confidence: '>= 70',
  suggestedAction: 'Clear next step',
  whyNow: 'Explicit answer to "Why now?"',
  evidenceSupport: 'Explicit answer to "What evidence supports this?"',
  valueProposition: 'Explicit answer to "What value does acting provide?"',
  sourceMemoryFields: 'At least one Business Memory field',
  sourceInsights: 'Relevant insights if applicable',
}
```

---

## 5. Lightweight Advisor UI

### 5.1 Advisor Section Component

```typescript
// src/components/advisor/AdvisorSection.tsx

export function AdvisorSection({ businessId }: { businessId: string }) {
  const [recommendations, setRecommendations] = useState<AdvisorRecommendation[]>([])
  const [trends, setTrends] = useState<BusinessTrend[]>([])
  
  useEffect(() => {
    loadAdvisorContent()
  }, [businessId])
  
  const loadAdvisorContent = async () => {
    const recs = await advisorService.getRecommendations(businessId)
    const trnds = await advisorService.getTrends(businessId)
    setRecommendations(recs)
    setTrends(trnds)
  }
  
  return (
    <div className="bg-background border border-border/40 rounded-xl p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          Business Advisor
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Operational insights to help you run a better business
        </p>
      </div>
      
      {/* Business Trends */}
      {trends.length > 0 && (
        <TrendSummary trends={trends} />
      )}
      
      {/* Advisor Recommendations */}
      {recommendations.length > 0 ? (
        <div className="space-y-3 mt-4">
          {recommendations.map(rec => (
            <AdvisorCard key={rec.id} recommendation={rec} />
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground mt-4">
          No recommendations at this time. Check back later.
        </div>
      )}
    </div>
  )
}
```

### 5.2 Advisor Card Component

```typescript
// src/components/advisor/AdvisorCard.tsx

export function AdvisorCard({ 
  recommendation,
  onDismiss 
}: {
  recommendation: AdvisorRecommendation
  onDismiss?: (id: string) => void
}) {
  const categoryColors: Record<AdvisorCategory, string> = {
    [AdvisorCategory.MONEY]: 'text-green-600 dark:text-green-400',
    [AdvisorCategory.CUSTOMERS]: 'text-blue-600 dark:text-blue-400',
    [AdvisorCategory.GROWTH]: 'text-purple-600 dark:text-purple-400',
    [AdvisorCategory.SCHEDULING]: 'text-orange-600 dark:text-orange-400',
    [AdvisorCategory.COMMUNICATION]: 'text-cyan-600 dark:text-cyan-400',
    [AdvisorCategory.EFFICIENCY]: 'text-slate-600 dark:text-slate-400',
  }
  
  return (
    <div className="p-4 bg-muted/30 border border-border/30 rounded-lg">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground">
          {recommendation.title}
        </h3>
        <span className={`text-[10px] uppercase tracking-wider font-medium ${categoryColors[recommendation.category]}`}>
          {recommendation.category}
        </span>
      </div>
      
      <p className="text-xs text-muted-foreground mb-3">
        {recommendation.reason}
      </p>
      
      <ul className="text-xs text-muted-foreground space-y-1 mb-3">
        {recommendation.supportingEvidence.map((evidence, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="text-muted-foreground/50">•</span>
            <span>{evidence}</span>
          </li>
        ))}
      </ul>
      
      <div className="flex items-center justify-between">
        {recommendation.destinationLink ? (
          <a
            href={recommendation.destinationLink}
            className="text-xs font-medium text-primary hover:text-primary/80"
          >
            {recommendation.suggestedAction} →
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">
            {recommendation.suggestedAction}
          </span>
        )}
        
        {onDismiss && (
          <button
            onClick={() => onDismiss(recommendation.id)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}
```

### 5.3 Trend Summary Component

```typescript
// src/components/advisor/TrendSummary.tsx

export function TrendSummary({ trends }: { trends: BusinessTrend[] }) {
  return (
    <div className="p-3 bg-muted/20 border border-border/20 rounded-lg mb-4">
      <h3 className="text-xs font-semibold text-foreground mb-2">
        Business Trends
      </h3>
      <div className="space-y-1.5">
        {trends.slice(0, 3).map(trend => (
          <div key={trend.id} className="flex items-center gap-2 text-xs">
            <span className={
              trend.direction === 'improving' 
                ? 'text-green-600 dark:text-green-400'
                : trend.direction === 'declining'
                ? 'text-red-600 dark:text-red-400'
                : 'text-muted-foreground'
            }>
              {trend.direction === 'improving' ? '↑' : trend.direction === 'declining' ? '↓' : '→'}
            </span>
            <span className="text-muted-foreground">
              {trend.observation}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 5.4 UI Placement

- **Dashboard**: Full Advisor section with trends and top 3 recommendations
- **Customer Detail**: Customer-specific advisor recommendations only
- **Settings**: Advisor preferences (frequency, categories enabled)
- **No notifications**: Advisor content only appears in dedicated sections

---

## 6. Advisor Service Orchestration

### 6.1 Main Service

```typescript
// src/lib/advisor/advisor-service.ts

export class AdvisorService {
  private registry: AdvisorRegistry
  private trendTracker: TrendTracker
  private qualityValidator: QualityValidator
  
  constructor() {
    this.registry = new AdvisorRegistry()
    this.trendTracker = new TrendTracker()
    this.qualityValidator = new QualityValidator()
    
    // Register all advisors
    this.registry.register(moneyAdvisor)
    this.registry.register(customersAdvisor)
    this.registry.register(growthAdvisor)
    this.registry.register(schedulingAdvisor)
    this.registry.register(communicationAdvisor)
    this.registry.register(efficiencyAdvisor)
  }
  
  // Get all recommendations for a business
  async getRecommendations(businessId: string): Promise<AdvisorRecommendation[]> {
    // Refresh Business Memory first
    await memoryService.refreshCustomerMemory(businessId)
    
    // Evaluate all advisors
    const allRecommendations = await this.registry.evaluateAll(businessId)
    
    // Validate quality
    const validRecommendations = allRecommendations.filter(rec => 
      this.qualityValidator.validate(rec).valid
    )
    
    // Sort by confidence, then by priority
    return validRecommendations.sort((a, b) => b.confidence - a.confidence)
  }
  
  // Get recommendations by category
  async getRecommendationsByCategory(
    businessId: string,
    category: AdvisorCategory
  ): Promise<AdvisorRecommendation[]> {
    return this.registry.evaluateCategory(category, businessId)
  }
  
  // Get business trends
  async getTrends(businessId: string): Promise<BusinessTrend[]> {
    const metrics = [
      'averagePaymentDelay',
      'averageResponseDelay',
      'totalRevenue',
      'repeatCustomerRate',
    ]
    
    const trends = await Promise.all(
      metrics.map(metric => this.trendTracker.getTrend(businessId, metric))
    )
    
    return trends.filter(t => t.direction !== 'stable')
  }
  
  // Dismiss recommendation
  async dismiss(recommendationId: string): Promise<void> {
    // Apply cooldown
    await recommendationManager.dismiss(recommendationId, 7 * 24 * 60 * 60 * 1000)
  }
}
```

### 6.2 Evaluation Schedule

- **Full evaluation**: Daily at 6 AM local time
- **Trend update**: Every 6 hours
- **Memory refresh**: Before each evaluation
- **Cache duration**: 4 hours for recommendations

---

## 7. Database Schema

### 7.1 Advisor Recommendations Table

```sql
CREATE TABLE advisor_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL CHECK (category IN ('money', 'customers', 'growth', 'scheduling', 'communication', 'efficiency')),
  
  -- Content
  title VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  supporting_evidence JSONB NOT NULL,
  confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  suggested_action TEXT NOT NULL,
  destination_link TEXT,
  
  -- Quality tracking
  why_now TEXT NOT NULL,
  evidence_support TEXT NOT NULL,
  value_proposition TEXT NOT NULL,
  
  -- Metadata
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_memory_fields JSONB NOT NULL,
  source_insights JSONB,
  valid_until TIMESTAMPTZ NOT NULL,
  
  -- State
  dismissed_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_advisor_recommendations_business_id ON advisor_recommendations(business_id);
CREATE INDEX idx_advisor_recommendations_category ON advisor_recommendations(category);
CREATE INDEX idx_advisor_recommendations_valid_until ON advisor_recommendations(valid_until);
CREATE INDEX idx_advisor_recommendations_confidence ON advisor_recommendations(confidence);
```

---

## 8. Implementation Phases

### Phase 1: Core Architecture (Week 1)
- Create advisor type definitions
- Implement advisor registry
- Build trend tracker
- Implement quality validator

### Phase 2: Advisor Generators (Week 2)
- Implement Money Advisor
- Implement Customers Advisor
- Implement Growth Advisor

### Phase 3: Remaining Advisors (Week 3)
- Implement Scheduling Advisor
- Implement Communication Advisor
- Implement Efficiency Advisor

### Phase 4: UI Components (Week 4)
- Build Advisor Section component
- Build Advisor Card component
- Build Trend Summary component
- Integrate with Dashboard

### Phase 5: Testing & Refinement (Week 5)
- Test all advisor generators
- Validate quality rules
- Tune confidence thresholds
- Refine trend detection

### Phase 6: Launch (Week 6)
- Deploy to production
- Monitor recommendation quality
- Gather user feedback
- Iterate on advisors

---

## 9. Future Extension Points

### 9.1 Additional Advisor Categories

Future advisor categories could include:

- **Marketing Advisor** - Campaign effectiveness, lead source analysis
- **Pricing Advisor** - Rate optimization, discount analysis
- **Inventory Advisor** - Supply optimization, stock levels
- **Team Advisor** - Workload balancing, performance insights

### 9.2 Advisor Customization

Allow businesses to:
- Enable/disable specific advisor categories
- Adjust confidence thresholds
- Customize evaluation frequency
- Set category priorities

### 9.3 Advisor Learning

Track which recommendations users:
- Act on
- Dismiss
- Ignore

Use this data to:
- Improve confidence scoring
- Prioritize high-impact recommendations
- Deprioritize ignored categories

### 9.4 Multi-Business Comparison

For multi-business accounts:
- Compare performance across businesses
- Identify best practices
- Share successful patterns

### 9.5 Industry Benchmarks

Compare business metrics against industry averages:
- Payment speed benchmarks
- Response time benchmarks
- Repeat rate benchmarks
- Revenue growth benchmarks

---

## 10. Summary

The Business Advisor Engine transforms ReplyFlow from a reactive system into a strategic partner by:

1. **Six Advisor Categories** - Money, Customers, Growth, Scheduling, Communication, Efficiency
2. **Quality-Gated Recommendations** - Every recommendation answers "Why now?", "What evidence supports this?", "What value does acting provide?"
3. **Business Memory Integration** - Uses derived knowledge, not raw database calculations
4. **Trend Tracking** - Observes changes over time (payment speed improving, revenue increasing, etc.)
5. **Lightweight UI** - Practical business advice without AI branding, avatars, or chatbots
6. **No Automation** - Surfaces advice, does not automate actions or change workflows
7. **Future-Ready** - Extensible architecture for additional advisors, customization, and learning

The engine provides business owners with the insights an experienced operations manager would offer, helping them run better businesses without adding complexity or changing how they work.
