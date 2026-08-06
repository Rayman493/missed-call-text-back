// Promise bridge for Tap to Pay education confirmation
// Allows orchestration to await user action from UI

type EducationResolution = 'completed' | 'canceled'

let educationResolver: ((resolution: EducationResolution) => void) | null = null
let educationPromise: Promise<EducationResolution> | null = null

export function createEducationPromise(): Promise<EducationResolution> {
  if (educationPromise) {
    console.warn('[EducationPromiseBridge] Education promise already exists')
  }
  
  educationPromise = new Promise<EducationResolution>((resolve) => {
    educationResolver = resolve
  })
  
  return educationPromise
}

export function resolveEducation(resolution: EducationResolution): void {
  if (!educationResolver) {
    console.warn('[EducationPromiseBridge] No education resolver available')
    return
  }
  
  educationResolver(resolution)
  educationResolver = null
  educationPromise = null
}

export function hasPendingEducationPromise(): boolean {
  return educationPromise !== null
}

export function resetEducationPromise(): void {
  educationResolver = null
  educationPromise = null
}
