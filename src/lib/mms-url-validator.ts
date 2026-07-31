/**
 * Global validator for outbound MMS media URLs
 * Prevents URLs with undefined, null, or malformed tokens from being sent to Twilio
 */

export class InvalidMmsMediaUrlError extends Error {
  constructor(message: string, public readonly url: string) {
    super(message)
    this.name = 'InvalidMmsMediaUrlError'
  }
}

/**
 * Validate an outbound MMS media URL
 * Throws InvalidMmsMediaUrlError if the URL contains token=undefined, token=null, or other invalid values
 */
export function assertValidOutboundMmsMediaUrl(urlString: string): URL {
  if (!urlString || typeof urlString !== 'string') {
    throw new InvalidMmsMediaUrlError('MMS media URL must be a non-empty string', urlString || '(empty)')
  }

  const url = new URL(urlString)

  // Check if this is an MMS media serve URL
  if (url.pathname.includes('/api/mms-media/serve')) {
    const token = url.searchParams.get('token')

    if (!token) {
      throw new InvalidMmsMediaUrlError('MMS media URL missing token parameter', urlString)
    }

    if (token === 'undefined') {
      throw new InvalidMmsMediaUrlError('MMS media URL contains literal "undefined" token', urlString)
    }

    if (token === 'null') {
      throw new InvalidMmsMediaUrlError('MMS media URL contains literal "null" token', urlString)
    }

    if (token.length < 10) {
      throw new InvalidMmsMediaUrlError('MMS media URL token is too short to be a valid JWT', urlString)
    }

    // Valid JWT should have 2 dots separating 3 segments
    const dotCount = (token.match(/\./g) || []).length
    if (dotCount !== 2) {
      throw new InvalidMmsMediaUrlError(`MMS media URL token has ${dotCount} dots instead of 2 (invalid JWT)`, urlString)
    }

    console.log('[MMS URL Validator] Valid MMS media URL:', {
      pathname: url.pathname,
      tokenLength: token.length,
      tokenDotCount: dotCount,
      tokenPrefix: token.substring(0, 6),
      tokenSuffix: token.slice(-6)
    })
  }

  return url
}

/**
 * Validate an array of outbound MMS media URLs
 * Throws InvalidMmsMediaUrlError if any URL is invalid
 */
export function assertValidOutboundMmsMediaUrls(urls: string[]): URL[] {
  if (!Array.isArray(urls)) {
    throw new InvalidMmsMediaUrlError('Media URLs must be an array', String(urls))
  }

  return urls.map((url, index) => {
    try {
      return assertValidOutboundMmsMediaUrl(url)
    } catch (error) {
      throw new InvalidMmsMediaUrlError(
        `Invalid MMS media URL at index ${index}: ${(error as Error).message}`,
        url
      )
    }
  })
}