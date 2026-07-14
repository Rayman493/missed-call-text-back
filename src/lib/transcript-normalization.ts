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
