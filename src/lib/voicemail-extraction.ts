/**
 * Voicemail Structured Extraction
 * 
 * Extracts structured information from voicemail transcripts
 * Reuses existing AI intake field mapping and normalization logic
 */

import { normalizeExtractedInfo, CANONICAL_FIELDS } from './ai-field-mapping'

export interface VoicemailExtractedInfo {
  callerName?: string
  reasonForCalling?: string
  importantDetails?: string
  urgencyLevel?: string
  addressOrLocation?: string
  preferredCallbackTime?: string
  callbackNumber?: string
}

export interface VoicemailExtractionResult {
  extractedInfo: VoicemailExtractedInfo
  confidence: number
  source: 'voicemail'
  extractedAt: string
}

/**
 * Extract structured information from voicemail transcript
 * Uses pattern matching and heuristics to identify key information
 */
export function extractFromVoicemailTranscript(transcript: string): VoicemailExtractionResult {
  const extracted: VoicemailExtractedInfo = {}
  let confidenceScore = 0
  let fieldsExtracted = 0

  if (!transcript || typeof transcript !== 'string') {
    return {
      extractedInfo: extracted,
      confidence: 0,
      source: 'voicemail',
      extractedAt: new Date().toISOString()
    }
  }

  const text = transcript.toLowerCase().trim()

  // Extract caller name
  const namePatterns = [
    /(?:this is|i'm|i am|my name is|calling from|it's|its)\s+([a-z][a-z\s]+?)(?:,|\.|and|i'm|i need|i want|i'm looking)/i,
    /(?:hi|hello|hey),?\s*(?:this is|i'm|i am)?\s*([a-z][a-z]+?)(?:,|\.|and|i need|i want|i'm looking)/i,
    /([a-z][a-z]+)\s+(?:calling|here)/i
  ]
  
  for (const pattern of namePatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const name = match[1].trim()
      // Validate name looks reasonable (2+ chars, no numbers, reasonable length)
      if (name.length >= 2 && name.length <= 50 && !/\d/.test(name) && name.split(' ').length <= 4) {
        extracted.callerName = capitalizeWords(name)
        confidenceScore += 0.15
        fieldsExtracted++
        break
      }
    }
  }

  // Extract reason for calling
  const reasonPatterns = [
    /(?:i'm|i am|looking for|need|want|would like|calling about|calling for)\s+(.+?)(?:\.|,|and|because|since|my|the|it's|its)/i,
    /(?:service|help|question|issue|problem|request)\s+(?:is|about|regarding)\s+(.+?)(?:\.|,|and)/i,
    /(?:can you|could you)\s+(?:help with|assist with|handle)\s+(.+?)(?:\.|,|and)/i
  ]
  
  for (const pattern of reasonPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const reason = match[1].trim()
      if (reason.length >= 3 && reason.length <= 200) {
        extracted.reasonForCalling = capitalizeWords(reason)
        confidenceScore += 0.2
        fieldsExtracted++
        break
      }
    }
  }

  // Extract urgency
  const urgencyPatterns = [
    /(?:urgent|emergency|asap|as soon as possible|right away|immediately|hurry|quickly)/i,
    /(?:not urgent|no rush|whenever|take your time|no hurry)/i
  ]
  
  for (const pattern of urgencyPatterns) {
    const match = text.match(pattern)
    if (match) {
      const urgency = match[0].toLowerCase()
      if (urgency.includes('not') || urgency.includes('no rush') || urgency.includes('whenever')) {
        extracted.urgencyLevel = 'not urgent'
      } else {
        extracted.urgencyLevel = 'urgent'
      }
      confidenceScore += 0.1
      fieldsExtracted++
      break
    }
  }

  // Extract address/location
  const addressPatterns = [
    /(?:at|located at|address is|my address is|location is|my location is|service address is)\s+(\d+\s+[a-z][a-z\s]+?)(?:\.|,|and|my|the|please|call)/i,
    /(\d+\s+[a-z][a-z\s]+?)(?:\.|,|and|please|call|i'm|i need)/i
  ]
  
  for (const pattern of addressPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const address = match[1].trim()
      // Validate address looks reasonable (starts with number, has street name)
      if (/^\d+/.test(address) && address.length >= 5 && address.length <= 100) {
        extracted.addressOrLocation = capitalizeWords(address)
        confidenceScore += 0.15
        fieldsExtracted++
        break
      }
    }
  }

  // Extract preferred callback time
  const timePatterns = [
    /(?:best time|prefer|when|available)\s+(?:to call|callback|reach me)\s+(.+?)(?:\.|,|and|my|the|please|call)/i,
    /(?:call me|callback)\s+(?:in|at|around|by)\s+(.+?)(?:\.|,|and|my|the|please)/i,
    /(?:morning|afternoon|evening|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*(?:at|around)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i
  ]
  
  for (const pattern of timePatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const time = match[1].trim()
      if (time.length >= 2 && time.length <= 50) {
        extracted.preferredCallbackTime = capitalizeWords(time)
        confidenceScore += 0.1
        fieldsExtracted++
        break
      }
    }
  }

  // Extract callback number (if different from caller ID)
  const phonePatterns = [
    /(?:callback|call me back|reach me|contact me)\s+(?:at|on)\s*(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/i,
    /(?:my number is|number is|phone is|phone number is)\s*(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/i
  ]
  
  for (const pattern of phonePatterns) {
    const match = text.match(pattern)
    if (match && (match[1] || match[0])) {
      // Extract the phone number from the match
      const phoneMatch = match[0].match(/(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/)
      if (phoneMatch) {
        const phone = `${phoneMatch[1]}${phoneMatch[2]}${phoneMatch[3]}`
        extracted.callbackNumber = phone
        confidenceScore += 0.1
        fieldsExtracted++
        break
      }
    }
  }

  // Extract additional details (anything that doesn't match other patterns)
  const detailsPatterns = [
    /(?:details|more information|specifically|it's|its|the issue is|the problem is)\s+(.+?)(?:\.|,|and|please|call|thank)/i
  ]
  
  for (const pattern of detailsPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const details = match[1].trim()
      if (details.length >= 5 && details.length <= 300) {
        extracted.importantDetails = capitalizeWords(details)
        confidenceScore += 0.2
        fieldsExtracted++
        break
      }
    }
  }

  // Calculate overall confidence based on fields extracted
  const overallConfidence = fieldsExtracted > 0 ? Math.min(1, confidenceScore) : 0

  return {
    extractedInfo: extracted,
    confidence: overallConfidence,
    source: 'voicemail',
    extractedAt: new Date().toISOString()
  }
}

/**
 * Safely merge voicemail extracted info with existing lead metadata
 * Preserves high-confidence existing data and user corrections
 */
export function safeMergeVoicemailExtraction(
  existingMetadata: any,
  voicemailExtraction: VoicemailExtractionResult
): any {
  const metadata = existingMetadata || {}
  const existingExtractedInfo = normalizeExtractedInfo(metadata.extracted_info || {})
  const voicemailExtractedInfo = voicemailExtraction.extractedInfo

  // Track sources for each field
  const sources = metadata.intake_sources || {}

  // Helper to safely merge a field
  const mergeField = (
    fieldName: keyof VoicemailExtractedInfo,
    voicemailValue: string | undefined,
    existingValue: string | undefined
  ) => {
    // Only populate if:
    // 1. Voicemail has a value
    // 2. Existing field is empty OR voicemail confidence is high
    if (voicemailValue && (!existingValue || voicemailExtraction.confidence > 0.5)) {
      return voicemailValue
    }
    return existingValue
  }

  const mergedExtractedInfo = {
    ...existingExtractedInfo,
    callerName: mergeField('callerName', voicemailExtractedInfo.callerName, existingExtractedInfo.callerName),
    reasonForCalling: mergeField('reasonForCalling', voicemailExtractedInfo.reasonForCalling, existingExtractedInfo.reasonForCalling),
    importantDetails: mergeField('importantDetails', voicemailExtractedInfo.importantDetails, existingExtractedInfo.importantDetails),
    urgencyLevel: mergeField('urgencyLevel', voicemailExtractedInfo.urgencyLevel, existingExtractedInfo.urgencyLevel),
    addressOrLocation: mergeField('addressOrLocation', voicemailExtractedInfo.addressOrLocation, existingExtractedInfo.addressOrLocation),
    preferredCallbackTime: mergeField('preferredCallbackTime', voicemailExtractedInfo.preferredCallbackTime, existingExtractedInfo.preferredCallbackTime),
    callbackNumber: mergeField('callbackNumber', voicemailExtractedInfo.callbackNumber, existingExtractedInfo.callbackNumber)
  }

  // Update sources for fields that were updated from voicemail
  if (voicemailExtractedInfo.callerName && mergedExtractedInfo.callerName === voicemailExtractedInfo.callerName) {
    sources.callerName = 'voicemail'
  }
  if (voicemailExtractedInfo.reasonForCalling && mergedExtractedInfo.reasonForCalling === voicemailExtractedInfo.reasonForCalling) {
    sources.reasonForCalling = 'voicemail'
  }
  if (voicemailExtractedInfo.importantDetails && mergedExtractedInfo.importantDetails === voicemailExtractedInfo.importantDetails) {
    sources.importantDetails = 'voicemail'
  }
  if (voicemailExtractedInfo.urgencyLevel && mergedExtractedInfo.urgencyLevel === voicemailExtractedInfo.urgencyLevel) {
    sources.urgencyLevel = 'voicemail'
  }
  if (voicemailExtractedInfo.addressOrLocation && mergedExtractedInfo.addressOrLocation === voicemailExtractedInfo.addressOrLocation) {
    sources.addressOrLocation = 'voicemail'
  }
  if (voicemailExtractedInfo.preferredCallbackTime && mergedExtractedInfo.preferredCallbackTime === voicemailExtractedInfo.preferredCallbackTime) {
    sources.preferredCallbackTime = 'voicemail'
  }
  if (voicemailExtractedInfo.callbackNumber && mergedExtractedInfo.callbackNumber === voicemailExtractedInfo.callbackNumber) {
    sources.callbackNumber = 'voicemail'
  }

  return {
    ...metadata,
    extracted_info: mergedExtractedInfo,
    intake_sources: sources,
    voicemail_extraction: {
      extractedAt: voicemailExtraction.extractedAt,
      confidence: voicemailExtraction.confidence,
      fieldsExtracted: Object.keys(voicemailExtractedInfo).filter(k => voicemailExtractedInfo[k as keyof VoicemailExtractedInfo]).length
    }
  }
}

/**
 * Capitalize words in a string
 */
function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, char => char.toUpperCase())
}
