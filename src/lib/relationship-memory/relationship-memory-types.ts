/**
 * Relationship Memory Type Definitions
 * 
 * Displays learned business knowledge about customers.
 * Synthesized from Business Memory, not raw database fields.
 */

export interface RelationshipProfile {
  customerId: string
  customerName: string
  
  // Relationship Basics
  relationshipAge: string // e.g., "2 years", "6 months"
  lifetimeRevenue: number
  completedJobs: number
  
  // Preferences
  favoriteService?: string
  preferredAppointmentTime?: string
  preferredCommunicationMethod?: string
  
  // Behavioral Patterns
  averageResponseTime?: string // e.g., "2 hours", "1 day"
  averagePaymentSpeed?: string // e.g., "immediate", "within 2 days"
  typicalBookingInterval?: string // e.g., "3 months", "6 months"
  
  // Relationship Quality
  customerValue: 'high' | 'medium' | 'low'
  repeatCustomerStatus: 'repeat' | 'one-time' | 'new'
  trustLevel: 'high' | 'medium' | 'low'
  communicationHealth: 'excellent' | 'good' | 'fair' | 'poor'
  paymentReliability: 'excellent' | 'good' | 'fair' | 'poor'
  
  // Predictions
  nextLikelyService?: string
}

export interface RelationshipContext {
  businessId: string
  customerId: string
}

export interface RelationshipServiceInterface {
  getRelationshipProfile(context: RelationshipContext): Promise<RelationshipProfile | null>
  invalidateCache(businessId: string): void
}
