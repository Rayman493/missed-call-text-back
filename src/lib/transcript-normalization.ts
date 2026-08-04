/**
 * Transcript Normalization Helper
 * 
 * Safely normalizes AI transcript data from various shapes into a canonical format.
 * Prevents crashes from malformed or legacy transcript data.
 */

export interface TranscriptMessage {
  id?: string;
  role: 'assistant' | 'caller' | 'user';
  content: string;
  timestamp?: string;
}

/**
 * Normalizes AI transcript data from various shapes into a canonical TranscriptMessage[].
 * 
 * Supported input shapes:
 * - TranscriptMessage[] (valid array)
 * - JSON string of TranscriptMessage[]
 * - { messages: TranscriptMessage[] }
 * - Plain string (treated as single message)
 * - Empty string
 * - null
 * - undefined
 * - Malformed JSON (returns empty array)
 * - Unsupported objects (returns empty array)
 * 
 * @param value - The transcript value to normalize
 * @returns Normalized array of TranscriptMessage objects
 */
export function normalizeAITranscript(value: unknown): TranscriptMessage[] {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return [];
  }

  // Handle valid array
  if (Array.isArray(value)) {
    return value.map(normalizeTranscriptMessage).filter(isValidMessage);
  }

  // Handle string
  if (typeof value === 'string') {
    // Empty string
    if (value.trim() === '') {
      return [];
    }

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeTranscriptMessage).filter(isValidMessage);
      }
      // If parsed is an object with messages array
      if (parsed && typeof parsed === 'object' && 'messages' in parsed && Array.isArray(parsed.messages)) {
        return parsed.messages.map(normalizeTranscriptMessage).filter(isValidMessage);
      }
      // If parsed is not array or messages object, treat as single message
      // Legacy fallback: flat strings are customer speech, not assistant
      return [{
        role: 'caller',
        content: value
      }];
    } catch {
      // Not valid JSON, treat as single message
      // Legacy fallback: flat strings are customer speech, not assistant
      return [{
        role: 'caller',
        content: value
      }];
    }
  }

  // Handle object with messages property
  if (typeof value === 'object' && value !== null) {
    if ('messages' in value && Array.isArray(value.messages)) {
      return value.messages.map(normalizeTranscriptMessage).filter(isValidMessage);
    }
    // Unsupported object shape
    return [];
  }

  // Fallback for unsupported types
  return [];
}

/**
 * Normalizes a single transcript message entry.
 */
function normalizeTranscriptMessage(entry: unknown): TranscriptMessage | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const obj = entry as Record<string, unknown>;

  // Extract content/text
  const content = extractContent(obj);
  if (!content) {
    return null;
  }

  // Extract role
  const role = extractRole(obj);
  if (!role) {
    return null;
  }

  // Extract optional fields
  const id = typeof obj.id === 'string' ? obj.id : undefined;
  const timestamp = typeof obj.timestamp === 'string' ? obj.timestamp : undefined;

  return {
    id,
    role,
    content,
    timestamp
  };
}

/**
 * Extracts content from various field names.
 */
function extractContent(obj: Record<string, unknown>): string | null {
  const content = obj.content || obj.text || obj.message || obj.body;
  if (typeof content === 'string' && content.trim() !== '') {
    return content.trim();
  }
  return null;
}

/**
 * Extracts and normalizes role from various field names.
 */
function extractRole(obj: Record<string, unknown>): 'assistant' | 'caller' | 'user' | null {
  const role = obj.role || obj.speaker || obj.sender || obj.type;
  
  if (typeof role !== 'string') {
    return null;
  }

  const normalizedRole = role.toLowerCase();
  
  if (normalizedRole === 'assistant' || normalizedRole === 'ai' || normalizedRole === 'system') {
    return 'assistant';
  }
  
  if (normalizedRole === 'caller' || normalizedRole === 'user' || normalizedRole === 'customer') {
    return 'caller';
  }
  
  if (normalizedRole === 'user') {
    return 'user';
  }
  
  return null;
}

/**
 * Validates that a message has required fields.
 */
function isValidMessage(message: TranscriptMessage | null): message is TranscriptMessage {
  return message !== null && !!message.content && !!message.role;
}

/**
 * Cleans and formats transcript text for display
 * Transforms raw speech-to-text into clean, readable English
 * 
 * Requirements:
 * - Proper capitalization
 * - Proper punctuation
 * - Paragraph breaks where appropriate
 * - Standardize times
 * - Standardize dates
 * - Remove unnecessary filler words ("um", "uh", etc.) when they don't change meaning
 * - Preserve customer intent
 * - Never invent information
 */
export function cleanTranscriptText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  let cleaned = text.trim();
  
  // Remove excessive whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  // Remove filler words that don't add meaning (when they appear as standalone words)
  // Preserve them when they're part of a meaningful phrase
  const fillerPatterns = [
    /\b(um|uh|ah|er)\b(?=\s|$)/gi,
    /\b(like|you know)\b(?=\s,\.])/gi,
  ];
  
  for (const pattern of fillerPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Clean up double spaces created by filler removal
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  // Standardize time formats
  cleaned = standardizeTimes(cleaned);
  
  // Add proper capitalization (sentence case)
  cleaned = capitalizeSentences(cleaned);
  
  // Add proper punctuation
  cleaned = addProperPunctuation(cleaned);
  
  // Add paragraph breaks for better readability
  cleaned = addParagraphBreaks(cleaned);
  
  return cleaned.trim();
}

/**
 * Standardizes time formats to be consistent (e.g., "4:00 PM", "2:00 PM–7:00 PM")
 */
function standardizeTimes(text: string): string {
  // Convert "4 pm" to "4:00 PM"
  text = text.replace(/\b(\d{1,2})\s*(am|pm)\b/gi, '$1:00 $2'.toUpperCase());
  
  // Convert "4:30 pm" to "4:30 PM"
  text = text.replace(/\b(\d{1,2}):(\d{2})\s*(am|pm)\b/gi, '$1:$2 $3'.toUpperCase());
  
  // Convert "four pm" or "4 o'clock" to "4:00 PM" (simple cases)
  const spokenHours: Record<string, string> = {
    'one': '1:00', 'two': '2:00', 'three': '3:00', 'four': '4:00', 'five': '5:00',
    'six': '6:00', 'seven': '7:00', 'eight': '8:00', 'nine': '9:00', 'ten': '10:00',
    'eleven': '11:00', 'twelve': '12:00'
  };
  
  for (const [spoken, formatted] of Object.entries(spokenHours)) {
    text = text.replace(new RegExp(`\\b${spoken}\\s*(am|pm)\\b`, 'gi'), `${formatted} $1`.toUpperCase());
  }
  
  // Standardize time ranges: "2 pm to 7 pm" -> "2:00 PM–7:00 PM"
  text = text.replace(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*(?:to|-|through)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/gi, '$1–$2');
  
  return text;
}

/**
 * Capitalizes the first letter of each sentence
 */
function capitalizeSentences(text: string): string {
  return text.replace(/(^\s*\w|[.!?]\s*\w)/g, (match) => match.toUpperCase());
}

/**
 * Adds proper punctuation to the text
 */
function addProperPunctuation(text: string): string {
  // Ensure sentences end with punctuation
  text = text.replace(/(\w)(\s*$)/gm, '$1.$2');
  
  // Ensure proper spacing after punctuation
  text = text.replace(/([.!?])([A-Z])/g, '$1 $2');
  
  // Remove duplicate punctuation
  text = text.replace(/([.!?])\1+/g, '$1');
  
  return text;
}

/**
 * Adds paragraph breaks for better readability
 * Breaks on logical sentence boundaries when there are multiple sentences
 */
function addParagraphBreaks(text: string): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  // If there are 3+ sentences, add paragraph breaks every 2-3 sentences
  if (sentences.length >= 3) {
    const paragraphs: string[] = [];
    for (let i = 0; i < sentences.length; i += 2) {
      paragraphs.push(sentences.slice(i, i + 2).join(' '));
    }
    return paragraphs.join('\n\n');
  }
  
  return text;
}
