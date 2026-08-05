export type ContactMethod = 'sms' | 'call' | 'email' | 'any'

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'any'

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday' | 'any'

export interface Provenance {
  derivedFrom: string // Source data type (e.g., 'appointments', 'messages', 'payments')
  sampleSize: number // Number of events used
  lastUpdated: string // ISO timestamp
  confidence: number // 0-100 confidence level
  explanation?: string // Human-readable explanation
}

export interface CustomerMemory {
  customerId: string
  businessId: string
  updatedAt: string

  // Communication patterns
  preferredContactMethod?: ContactMethod
  preferredContactMethodProvenance?: Provenance
  preferredAppointmentTime?: TimeOfDay
  preferredAppointmentTimeProvenance?: Provenance
  preferredDay?: DayOfWeek
  preferredDayProvenance?: Provenance
  averageResponseDelay?: number // in hours
  averageResponseDelayProvenance?: Provenance
  communicationFrequency?: number // messages per week
  communicationFrequencyProvenance?: Provenance

  // Payment behavior
  averagePaymentDelay?: number // in days
  averagePaymentDelayProvenance?: Provenance
  onTimePaymentRate?: number // percentage 0-100
  onTimePaymentRateProvenance?: Provenance

  // Customer value
  repeatCustomer: boolean
  repeatCustomerProvenance?: Provenance
  jobCount: number
  averageJobValue?: number
  averageJobValueProvenance?: Provenance
  estimatedCustomerValue?: number
  estimatedCustomerValueProvenance?: Provenance
  lifetimeRevenue?: number
  lifetimeRevenueProvenance?: Provenance

  // Service preferences
  favoriteService?: string
  favoriteServiceProvenance?: Provenance
  mostRequestedService?: string
  mostRequestedServiceProvenance?: Provenance

  // Timeline
  firstJobDate?: string
  lastJobDate?: string
  lastCompletedJobDate?: string
  lastSuccessfulFollowUp?: string
  averageIntervalBetweenJobs?: number // in days
  averageIntervalBetweenJobsProvenance?: Provenance

  // Property knowledge
  propertySize?: string
  propertyType?: string
  hasFence?: boolean
}

export interface BusinessMemory {
  businessId: string
  updatedAt: string

  // Operational patterns
  busiestDay?: DayOfWeek
  busiestDayProvenance?: Provenance
  busiestTimeOfDay?: TimeOfDay
  busiestTimeOfDayProvenance?: Provenance
  averageJobsPerDay?: number
  averageJobsPerDayProvenance?: Provenance
  averageJobsPerWeek?: number
  averageJobsPerWeekProvenance?: Provenance

  // Financial patterns
  averagePaymentDelay?: number // in days
  averagePaymentDelayProvenance?: Provenance
  averageJobValue?: number
  averageJobValueProvenance?: Provenance
  monthlyRevenue?: number
  monthlyRevenueProvenance?: Provenance
  averageDailyRevenue?: number
  averageDailyRevenueProvenance?: Provenance

  // Service patterns
  mostRequestedService?: string
  mostRequestedServiceProvenance?: Provenance
  serviceDistribution?: Record<string, number>

  // Customer patterns
  totalCustomers: number
  repeatCustomerRate?: number // percentage
  repeatCustomerRateProvenance?: Provenance
  activeCustomerRate?: number // percentage
  averageCustomerLifetime?: number // in days

  // Follow-up effectiveness
  followUpSuccessRate?: number // percentage
  averageFollowUpResponseTime?: number // in hours
  averageFollowUpResponseTimeProvenance?: Provenance

  // Seasonal patterns
  slowSeasonMonths?: number[]
  peakSeasonMonths?: number[]
}

export interface MemoryBuildResult {
  customerMemory?: CustomerMemory
  businessMemory?: BusinessMemory
  buildTime: string
}
