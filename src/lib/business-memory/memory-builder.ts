import { CustomerMemory, BusinessMemory, MemoryBuildResult, ContactMethod, TimeOfDay, DayOfWeek } from './types'
import {
  MINIMUM_SAMPLE_SIZES,
  calculateConfidence,
  createProvenance,
  safeAverage,
  safeSum,
  removeDuplicates,
  filterValidTimestamps
} from './confidence-rules'

/**
 * Build customer memory from raw data
 * This is a deterministic process that extracts durable knowledge from events
 * Handles edge cases: division by zero, null values, missing timestamps, duplicates
 */
export function buildCustomerMemory(
  customerId: string,
  businessId: string,
  data: {
    messages?: Array<{ created_at: string; direction: 'inbound' | 'outbound'; type?: string }>
    jobs?: Array<{ created_at: string; status: string; amount?: number; service?: string; scheduled_date?: string }>
    payments?: Array<{ created_at: string; amount: number; status: string }>
  }
): CustomerMemory {
  const now = new Date().toISOString()

  // Filter and validate data
  const validMessages = data.messages?.filter(m => m.created_at && !isNaN(new Date(m.created_at).getTime())) || []
  const validJobs = data.jobs?.filter(j => j.created_at && !isNaN(new Date(j.created_at).getTime())) || []
  const validPayments = data.payments?.filter(p => p.created_at && !isNaN(new Date(p.created_at).getTime())) || []

  // Remove duplicate jobs by ID if available
  const uniqueJobs = removeDuplicates(validJobs, j => j.created_at + j.status)

  // Calculate job statistics
  const completedJobs = uniqueJobs.filter(j => j.status === 'completed')
  const jobCount = completedJobs.length
  const repeatCustomer = jobCount >= MINIMUM_SAMPLE_SIZES.repeatCustomer

  // Calculate average job value
  const jobValues = completedJobs
    .filter(j => j.amount !== undefined && j.amount !== null && j.amount > 0)
    .map(j => j.amount as number)
  const averageJobValue = safeAverage(jobValues)
  const averageJobValueProvenance = averageJobValue !== undefined
    ? createProvenance(
        'jobs',
        jobValues.length,
        MINIMUM_SAMPLE_SIZES.averageJobValue,
        `Calculated from ${jobValues.length} completed jobs. Latest job: ${completedJobs[completedJobs.length - 1]?.created_at?.split('T')[0]}`
      )
    : undefined

  // Calculate lifetime revenue
  const lifetimeRevenue = jobValues.length > 0 ? safeSum(jobValues) : undefined
  const lifetimeRevenueProvenance = lifetimeRevenue !== undefined
    ? createProvenance(
        'jobs',
        jobValues.length,
        MINIMUM_SAMPLE_SIZES.averageJobValue,
        `Sum of ${jobValues.length} completed job values.`
      )
    : undefined

  // Estimate customer value (average job value * job count)
  const estimatedCustomerValue = averageJobValue !== undefined && jobCount > 0
    ? averageJobValue * jobCount
    : undefined
  const estimatedCustomerValueProvenance = estimatedCustomerValue !== undefined && averageJobValue !== undefined && averageJobValueProvenance
    ? { ...averageJobValueProvenance, explanation: `Average job value (${averageJobValue.toFixed(2)}) × job count (${jobCount})` }
    : undefined

  // Determine preferred contact method from message types
  const messageTypes = validMessages
  const smsCount = messageTypes.filter(m => m.type === 'sms').length
  const callCount = messageTypes.filter(m => m.type === 'call').length
  const totalMessages = messageTypes.length
  
  let preferredContactMethod: ContactMethod | undefined
  let preferredContactMethodProvenance: ReturnType<typeof createProvenance> | undefined
  
  if (totalMessages >= MINIMUM_SAMPLE_SIZES.preferredContactMethod) {
    if (smsCount > callCount) {
      preferredContactMethod = 'sms'
    } else if (callCount > smsCount) {
      preferredContactMethod = 'call'
    }
    if (preferredContactMethod) {
      preferredContactMethodProvenance = createProvenance(
        'messages',
        totalMessages,
        MINIMUM_SAMPLE_SIZES.preferredContactMethod,
        `SMS: ${smsCount}, Call: ${callCount}.`
      )
    }
  }

  // Determine preferred appointment time from job scheduled dates
  const scheduledJobs = completedJobs.filter(j => j.scheduled_date && !isNaN(new Date(j.scheduled_date!).getTime()))
  const hours: number[] = scheduledJobs.map(j => new Date(j.scheduled_date!).getHours())
  
  let preferredAppointmentTime: TimeOfDay | undefined
  let preferredAppointmentTimeProvenance: ReturnType<typeof createProvenance> | undefined
  
  if (hours.length >= MINIMUM_SAMPLE_SIZES.preferredAppointmentTime) {
    const timeCounts: Record<string, number> = { morning: 0, afternoon: 0, evening: 0 }
    hours.forEach(h => {
      if (h >= 6 && h < 12) timeCounts.morning++
      else if (h >= 12 && h < 18) timeCounts.afternoon++
      else if (h >= 18 && h < 22) timeCounts.evening++
    })
    const mostCommonTime = Object.entries(timeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as TimeOfDay
    if (mostCommonTime && mostCommonTime !== 'any') {
      preferredAppointmentTime = mostCommonTime
      preferredAppointmentTimeProvenance = createProvenance(
        'appointments',
        hours.length,
        MINIMUM_SAMPLE_SIZES.preferredAppointmentTime,
        `Morning: ${timeCounts.morning}, Afternoon: ${timeCounts.afternoon}, Evening: ${timeCounts.evening}.`
      )
    }
  }

  // Determine preferred day from job scheduled dates
  const days: number[] = scheduledJobs.map(j => new Date(j.scheduled_date!).getDay())
  const dayCounts: Record<number, number> = {}
  days.forEach(d => {
    dayCounts[d] = (dayCounts[d] || 0) + 1
  })
  
  let preferredDay: DayOfWeek | undefined
  let preferredDayProvenance: ReturnType<typeof createProvenance> | undefined
  
  if (days.length >= MINIMUM_SAMPLE_SIZES.preferredDay) {
    const mostCommonDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]
    if (mostCommonDay) {
      const dayMap: Record<number, DayOfWeek> = {
        0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
        4: 'thursday', 5: 'friday', 6: 'saturday'
      }
      preferredDay = dayMap[parseInt(mostCommonDay[0])]
      if (preferredDay && preferredDay !== 'any') {
        preferredDayProvenance = createProvenance(
          'appointments',
          days.length,
          MINIMUM_SAMPLE_SIZES.preferredDay,
          `Most common: ${preferredDay} (${mostCommonDay[1]} of ${days.length}).`
        )
      }
    }
  }

  // Calculate average response delay
  const responseDelays: number[] = []
  for (let i = 1; i < messageTypes.length; i++) {
    if (messageTypes[i].direction === 'inbound' && messageTypes[i - 1].direction === 'outbound') {
      const inboundTime = new Date(messageTypes[i].created_at).getTime()
      const outboundTime = new Date(messageTypes[i - 1].created_at).getTime()
      const delayHours = (inboundTime - outboundTime) / (1000 * 60 * 60)
      if (delayHours > 0 && delayHours < 168) {
        responseDelays.push(delayHours)
      }
    }
  }
  
  let averageResponseDelay: number | undefined
  let averageResponseDelayProvenance: ReturnType<typeof createProvenance> | undefined
  
  if (responseDelays.length >= MINIMUM_SAMPLE_SIZES.averageResponseDelay) {
    averageResponseDelay = safeAverage(responseDelays)
    if (averageResponseDelay !== undefined) {
      averageResponseDelayProvenance = createProvenance(
        'messages',
        responseDelays.length,
        MINIMUM_SAMPLE_SIZES.averageResponseDelay,
        `Calculated from ${responseDelays.length} response pairs.`
      )
    }
  }

  // Communication frequency (messages per week over customer lifetime)
  const firstMessage = messageTypes[0]?.created_at
  let communicationFrequency: number | undefined
  let communicationFrequencyProvenance: ReturnType<typeof createProvenance> | undefined
  
  if (firstMessage && messageTypes.length > 0) {
    const weeksSinceFirst = Math.max(1, (Date.now() - new Date(firstMessage).getTime()) / (1000 * 60 * 60 * 24 * 7))
    communicationFrequency = messageTypes.length / weeksSinceFirst
    communicationFrequencyProvenance = createProvenance(
      'messages',
      messageTypes.length,
      1,
      `${messageTypes.length} messages over ${weeksSinceFirst.toFixed(1)} weeks.`
    )
  }

  // Timeline
  const jobTimestamps = filterValidTimestamps(completedJobs.map(j => j.created_at))
  const firstJobDate = jobTimestamps[0]
  const lastJobDate = jobTimestamps[jobTimestamps.length - 1]
  const lastCompletedJobDate = lastJobDate

  // Calculate average interval between jobs
  const jobDates = jobTimestamps.map(ts => new Date(ts).getTime()).sort((a, b) => a - b)
  const intervals: number[] = []
  for (let i = 1; i < jobDates.length; i++) {
    const days = (jobDates[i] - jobDates[i - 1]) / (1000 * 60 * 60 * 24)
    if (days > 0 && days < 365) {
      intervals.push(days)
    }
  }
  
  let averageIntervalBetweenJobs: number | undefined
  let averageIntervalBetweenJobsProvenance: ReturnType<typeof createProvenance> | undefined
  
  if (intervals.length >= 1) {
    averageIntervalBetweenJobs = safeAverage(intervals)
    if (averageIntervalBetweenJobs !== undefined) {
      averageIntervalBetweenJobsProvenance = createProvenance(
        'jobs',
        intervals.length,
        1,
        `Calculated from ${intervals.length} intervals between ${jobCount} jobs.`
      )
    }
  }

  // Determine most requested service
  const services = completedJobs.map(j => j.service).filter((s): s is string => !!s)
  const serviceCounts: Record<string, number> = {}
  services.forEach(s => {
    serviceCounts[s] = (serviceCounts[s] || 0) + 1
  })
  const mostRequestedService = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
  const mostRequestedServiceProvenance = mostRequestedService
    ? createProvenance(
        'jobs',
        services.length,
        MINIMUM_SAMPLE_SIZES.favoriteService,
        `Most requested: ${mostRequestedService} (${serviceCounts[mostRequestedService]} of ${services.length}).`
      )
    : undefined

  const repeatCustomerProvenance = createProvenance(
    'jobs',
    jobCount,
    MINIMUM_SAMPLE_SIZES.repeatCustomer,
    repeatCustomer ? `Has ${jobCount} completed jobs.` : `Has ${jobCount} completed job.`
  )

  return {
    customerId,
    businessId,
    updatedAt: now,
    preferredContactMethod,
    preferredContactMethodProvenance,
    preferredAppointmentTime,
    preferredAppointmentTimeProvenance,
    preferredDay,
    preferredDayProvenance,
    averageResponseDelay,
    averageResponseDelayProvenance,
    communicationFrequency,
    communicationFrequencyProvenance,
    averagePaymentDelay: undefined,
    averagePaymentDelayProvenance: undefined,
    onTimePaymentRate: undefined,
    onTimePaymentRateProvenance: undefined,
    repeatCustomer,
    repeatCustomerProvenance,
    jobCount,
    averageJobValue,
    averageJobValueProvenance,
    estimatedCustomerValue,
    estimatedCustomerValueProvenance,
    lifetimeRevenue,
    lifetimeRevenueProvenance,
    favoriteService: mostRequestedService,
    favoriteServiceProvenance: mostRequestedServiceProvenance,
    mostRequestedService,
    mostRequestedServiceProvenance,
    firstJobDate,
    lastJobDate,
    lastCompletedJobDate,
    lastSuccessfulFollowUp: undefined,
    averageIntervalBetweenJobs,
    averageIntervalBetweenJobsProvenance,
    propertySize: undefined,
    propertyType: undefined,
    hasFence: undefined
  }
}

/**
 * Build business memory from raw data
 * This aggregates patterns across all customers
 * Handles edge cases: division by zero, null values, empty arrays
 */
export function buildBusinessMemory(
  businessId: string,
  data: {
    customers: number
    customerMemories: CustomerMemory[]
    jobs?: Array<{ created_at: string; status: string; amount?: number; service?: string; scheduled_date?: string }>
    payments?: Array<{ created_at: string; amount: number; status: string }>
  }
): BusinessMemory {
  const now = new Date().toISOString()
  const validCustomerMemories = data.customerMemories.filter(cm => cm.customerId && cm.businessId === businessId)

  // Calculate repeat customer rate
  const repeatCustomers = validCustomerMemories.filter(cm => cm.repeatCustomer).length
  const totalCustomers = Math.max(1, data.customers)
  const repeatCustomerRate = (repeatCustomers / totalCustomers) * 100
  const repeatCustomerRateProvenance = createProvenance(
    'customer_memories',
    validCustomerMemories.length,
    1,
    `${repeatCustomers} repeat customers out of ${totalCustomers} total.`
  )

  // Calculate average job value across all customers
  const jobValues = validCustomerMemories
    .map(cm => cm.averageJobValue)
    .filter((v): v is number => v !== undefined && v > 0)
  const averageJobValue = safeAverage(jobValues)
  const averageJobValueProvenance = averageJobValue !== undefined
    ? createProvenance(
        'customer_memories',
        jobValues.length,
        MINIMUM_SAMPLE_SIZES.averageJobValue,
        `Aggregated from ${jobValues.length} customers.`
      )
    : undefined

  // Calculate average payment delay across all customers
  const paymentDelays = validCustomerMemories
    .map(cm => cm.averagePaymentDelay)
    .filter((v): v is number => v !== undefined && v >= 0)
  const averagePaymentDelay = safeAverage(paymentDelays)
  const averagePaymentDelayProvenance = averagePaymentDelay !== undefined
    ? createProvenance(
        'customer_memories',
        paymentDelays.length,
        MINIMUM_SAMPLE_SIZES.averagePaymentDelay,
        `Aggregated from ${paymentDelays.length} customers.`
      )
    : undefined

  // Calculate monthly revenue from customer lifetime revenues
  const lifetimeRevenues = validCustomerMemories
    .map(cm => cm.lifetimeRevenue)
    .filter((v): v is number => v !== undefined && v > 0)
  const totalLifetimeRevenue = safeSum(lifetimeRevenues)
  const monthlyRevenue = totalLifetimeRevenue > 0 ? totalLifetimeRevenue / 12 : undefined
  const monthlyRevenueProvenance = monthlyRevenue !== undefined
    ? createProvenance(
        'customer_memories',
        lifetimeRevenues.length,
        1,
        `Total lifetime revenue: $${totalLifetimeRevenue.toFixed(2)}.`
      )
    : undefined

  // Determine most requested service across all customers
  const allServices = validCustomerMemories
    .map(cm => cm.mostRequestedService)
    .filter((s): s is string => !!s)
  const serviceCounts: Record<string, number> = {}
  allServices.forEach(s => {
    serviceCounts[s] = (serviceCounts[s] || 0) + 1
  })
  const mostRequestedService = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
  const mostRequestedServiceProvenance = mostRequestedService
    ? createProvenance(
        'customer_memories',
        allServices.length,
        MINIMUM_SAMPLE_SIZES.favoriteService,
        `Most requested: ${mostRequestedService} (${serviceCounts[mostRequestedService]} of ${allServices.length}).`
      )
    : undefined

  // Calculate average jobs per week from customer job counts and intervals
  const averageIntervalBetweenJobs = validCustomerMemories
    .map(cm => cm.averageIntervalBetweenJobs)
    .filter((v): v is number => v !== undefined && v > 0)
  let averageJobsPerWeek: number | undefined
  let averageJobsPerWeekProvenance: ReturnType<typeof createProvenance> | undefined
  
  if (averageIntervalBetweenJobs.length >= MINIMUM_SAMPLE_SIZES.averageJobsPerWeek) {
    const avgInterval = safeAverage(averageIntervalBetweenJobs)
    if (avgInterval !== undefined && avgInterval > 0) {
      averageJobsPerWeek = 7 / avgInterval
      averageJobsPerWeekProvenance = createProvenance(
        'customer_memories',
        averageIntervalBetweenJobs.length,
        MINIMUM_SAMPLE_SIZES.averageJobsPerWeek,
        `Average interval: ${avgInterval.toFixed(1)} days.`
      )
    }
  }

  // Determine busiest day from customer preferences
  const preferredDays = validCustomerMemories
    .map(cm => cm.preferredDay)
    .filter((d): d is DayOfWeek => !!d && d !== 'any')
  const dayCounts: Record<string, number> = {}
  preferredDays.forEach(d => {
    dayCounts[d] = (dayCounts[d] || 0) + 1
  })
  let busiestDay: DayOfWeek | undefined
  let busiestDayProvenance: ReturnType<typeof createProvenance> | undefined
  
  if (preferredDays.length >= MINIMUM_SAMPLE_SIZES.busiestDay) {
    const mostCommonDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as DayOfWeek
    if (mostCommonDay && mostCommonDay !== 'any') {
      busiestDay = mostCommonDay
      busiestDayProvenance = createProvenance(
        'customer_memories',
        preferredDays.length,
        MINIMUM_SAMPLE_SIZES.busiestDay,
        `Most common: ${busiestDay} (${dayCounts[busiestDay]} of ${preferredDays.length}).`
      )
    }
  }

  // Determine busiest time of day from customer preferences
  const preferredTimes = validCustomerMemories
    .map(cm => cm.preferredAppointmentTime)
    .filter((t): t is TimeOfDay => !!t && t !== 'any')
  const timeCounts: Record<string, number> = {}
  preferredTimes.forEach(t => {
    timeCounts[t] = (timeCounts[t] || 0) + 1
  })
  let busiestTimeOfDay: TimeOfDay | undefined
  let busiestTimeOfDayProvenance: ReturnType<typeof createProvenance> | undefined
  
  if (preferredTimes.length >= MINIMUM_SAMPLE_SIZES.busiestTimeOfDay) {
    const mostCommonTime = Object.entries(timeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as TimeOfDay
    if (mostCommonTime && mostCommonTime !== 'any') {
      busiestTimeOfDay = mostCommonTime
      busiestTimeOfDayProvenance = createProvenance(
        'customer_memories',
        preferredTimes.length,
        MINIMUM_SAMPLE_SIZES.busiestTimeOfDay,
        `Most common: ${busiestTimeOfDay} (${timeCounts[busiestTimeOfDay]} of ${preferredTimes.length}).`
      )
    }
  }

  const averageJobsPerDay = averageJobsPerWeek !== undefined ? averageJobsPerWeek / 7 : undefined
  const averageJobsPerDayProvenance = averageJobsPerWeekProvenance
    ? { ...averageJobsPerWeekProvenance, explanation: averageJobsPerWeekProvenance.explanation?.replace('interval', 'daily rate') }
    : undefined

  const averageDailyRevenue = monthlyRevenue !== undefined ? monthlyRevenue / 30 : undefined
  const averageDailyRevenueProvenance = monthlyRevenueProvenance
    ? { ...monthlyRevenueProvenance, explanation: monthlyRevenueProvenance.explanation?.replace('lifetime revenue', 'daily revenue') }
    : undefined

  // Calculate average follow-up response time across all customers
  const responseTimes = validCustomerMemories
    .map(cm => cm.averageResponseDelay)
    .filter((v): v is number => v !== undefined && v >= 0)
  const averageFollowUpResponseTime = responseTimes.length > 0
    ? safeAverage(responseTimes)
    : undefined
  const averageFollowUpResponseTimeProvenance = averageFollowUpResponseTime !== undefined
    ? createProvenance(
        'customer_memories',
        responseTimes.length,
        1,
        `Aggregated from ${responseTimes.length} customers.`
      )
    : undefined

  return {
    businessId,
    updatedAt: now,
    busiestDay,
    busiestDayProvenance,
    busiestTimeOfDay,
    busiestTimeOfDayProvenance,
    averageJobsPerDay,
    averageJobsPerDayProvenance,
    averageJobsPerWeek,
    averageJobsPerWeekProvenance,
    averagePaymentDelay,
    averagePaymentDelayProvenance,
    averageJobValue,
    averageJobValueProvenance,
    monthlyRevenue,
    monthlyRevenueProvenance,
    averageDailyRevenue,
    averageDailyRevenueProvenance,
    mostRequestedService,
    mostRequestedServiceProvenance,
    serviceDistribution: undefined,
    totalCustomers: data.customers,
    repeatCustomerRate,
    repeatCustomerRateProvenance,
    activeCustomerRate: undefined,
    averageCustomerLifetime: undefined,
    followUpSuccessRate: undefined,
    averageFollowUpResponseTime,
    averageFollowUpResponseTimeProvenance,
    slowSeasonMonths: undefined,
    peakSeasonMonths: undefined
  }
}

/**
 * Build both customer and business memory from raw data
 */
export function buildMemory(
  customerId: string,
  businessId: string,
  customerData: {
    messages?: Array<{ created_at: string; direction: 'inbound' | 'outbound'; type?: string }>
    jobs?: Array<{ created_at: string; status: string; amount?: number; service?: string; scheduled_date?: string }>
    payments?: Array<{ created_at: string; amount: number; status: string }>
  },
  businessData: {
    customers: number
    customerMemories: CustomerMemory[]
    jobs?: Array<{ created_at: string; status: string; amount?: number; service?: string; scheduled_date?: string }>
    payments?: Array<{ created_at: string; amount: number; status: string }>
  }
): MemoryBuildResult {
  const customerMemory = buildCustomerMemory(customerId, businessId, customerData)
  const businessMemory = buildBusinessMemory(businessId, businessData)

  return {
    customerMemory,
    businessMemory,
    buildTime: new Date().toISOString()
  }
}
