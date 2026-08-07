// Promise bridge for Tap to Pay education confirmation
// Allows orchestration to await user action from UI

export type EducationResolution = 'completed' | 'canceled' | 'dismissed' | 'failed' | 'timeout' | 'unknown'

let educationResolver: ((resolution: EducationResolution) => void) | null = null
let educationPromise: Promise<EducationResolution> | null = null
let educationTimeoutId: NodeJS.Timeout | null = null

const EDUCATION_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export function createEducationPromise(timeoutMs: number = EDUCATION_TIMEOUT_MS): Promise<EducationResolution> {
  if (educationPromise) {
    console.warn('[EducationPromiseBridge] Education promise already exists, resetting')
    resetEducationPromise()
  }
  
  educationPromise = new Promise<EducationResolution>((resolve) => {
    educationResolver = resolve
    
    // Set timeout to auto-resolve if user doesn't respond
    educationTimeoutId = setTimeout(() => {
      console.warn('[EducationPromiseBridge] Education timed out after', timeoutMs, 'ms')
      resolve('timeout')
      educationResolver = null
      educationPromise = null
      educationTimeoutId = null
    }, timeoutMs)
  })
  
  return educationPromise
}

export function resolveEducation(resolution: EducationResolution): void {
  if (!educationResolver) {
    console.warn('[EducationPromiseBridge] No education resolver available')
    return
  }
  
  // Clear timeout if resolution came from user action
  if (educationTimeoutId) {
    clearTimeout(educationTimeoutId)
    educationTimeoutId = null
  }
  
  educationResolver(resolution)
  educationResolver = null
  educationPromise = null
}

export function hasPendingEducationPromise(): boolean {
  return educationPromise !== null
}

export function resetEducationPromise(): void {
  if (educationTimeoutId) {
    clearTimeout(educationTimeoutId)
    educationTimeoutId = null
  }
  educationResolver = null
  educationPromise = null
}

// Helper to classify native education return values
export function classifyNativeEducationReturn(
  presented: boolean,
  completionStatus?: string,
  requiresConfirmation?: boolean
): EducationResolution {
  if (!presented) {
    return 'failed'
  }
  
  if (completionStatus === 'completed') {
    return 'completed'
  }
  
  if (completionStatus === 'dismissed') {
    return 'dismissed'
  }
  
  if (completionStatus === 'canceled') {
    return 'canceled'
  }
  
  if (completionStatus === 'failed') {
    return 'failed'
  }
  
  if (completionStatus === 'presented_awaiting_confirmation' && requiresConfirmation) {
    // Will be resolved by user confirmation via promise bridge
    return 'unknown'
  }
  
  return 'unknown'
}
