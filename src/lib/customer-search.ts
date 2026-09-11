/**
 * Customer search precision helper.
 *
 * Primary customer search is based on customer name and customer phone only.
 * It does NOT search request/reason, details, address, callback time, job data,
 * notes, payment metadata, status text, or arbitrary metadata blobs.
 *
 * Name matching uses case-insensitive token-prefix behavior:
 *   - "A"      → matches "Add Manual Customer Test" (token "add" starts with "a")
 *              → does NOT match "Ryan Bandi" (no token starts with "a")
 *   - "Ry"     → matches "Ryan Bandi", "Ryan Test"
 *   - "Bandi"  → matches "Ryan Bandi" (token "bandi" starts with "bandi")
 *   - "yan"    → does NOT match "Ryan" (no token starts with "yan")
 *   - "Ryan B" → matches "Ryan Bandi" (multiword prefix in order)
 *   - "Add Man"→ matches "Add Manual Customer Test"
 *
 * Phone matching normalizes digits and supports exact full phone and phone-prefix.
 *
 * Deterministic relevance order (lower rank = more relevant):
 *   1. exact full name
 *   2. full name starts with query
 *   3. token-prefix name match
 *   4. exact phone
 *   5. phone-prefix
 */

export interface CustomerSearchable {
  name?: string | null
  caller_phone?: string | null
  email?: string | null
}

/** Placeholders that should never be treated as a real name for matching. */
const NAME_PLACEHOLDERS = new Set([
  'not collected',
  'unknown',
  'anonymous',
  'no name',
  '',
])

function isPlaceholderName(name: string | null | undefined): boolean {
  if (!name) return true
  return NAME_PLACEHOLDERS.has(name.trim().toLowerCase())
}

/** Normalize a phone string to digits only. */
export function normalizePhoneDigits(phone: string | null | undefined): string {
  if (!phone) return ''
  return phone.replace(/[\s\(\)\-\.\+]/g, '')
}

function tokenize(value: string): string[] {
  return value.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

/**
 * Token-prefix name match.
 *
 * Tries to match query tokens against a contiguous subsequence of name tokens,
 * where each query token is a prefix of the corresponding name token.
 */
function tokenPrefixMatch(queryTokens: string[], nameTokens: string[]): boolean {
  if (queryTokens.length === 0 || nameTokens.length === 0) return false
  if (queryTokens.length > nameTokens.length) return false
  // Try each starting position in the name tokens.
  for (let start = 0; start <= nameTokens.length - queryTokens.length; start++) {
    let ok = true
    for (let i = 0; i < queryTokens.length; i++) {
      if (!nameTokens[start + i].startsWith(queryTokens[i])) {
        ok = false
        break
      }
    }
    if (ok) return true
  }
  return false
}

/** Rank constants (lower = more relevant). 0 means no match. */
const RANK_EXACT_NAME = 1
const RANK_NAME_STARTSWITH = 2
const RANK_TOKEN_PREFIX = 3
const RANK_EXACT_PHONE = 4
const RANK_PHONE_PREFIX = 5
const NO_MATCH = 0

/**
 * Compute a relevance rank for a customer against a query.
 * Returns 0 when there is no match.
 */
export function rankCustomerForQuery(
  customer: CustomerSearchable,
  query: string
): number {
  const q = query.trim().toLowerCase()
  if (!q) return RANK_EXACT_NAME // empty query: everyone matches, neutral rank

  // --- Name matching ---
  if (!isPlaceholderName(customer.name)) {
    const name = customer.name!.trim().toLowerCase()
    if (name === q) return RANK_EXACT_NAME
    if (name.startsWith(q)) return RANK_NAME_STARTSWITH
    const queryTokens = tokenize(q)
    const nameTokens = tokenize(name)
    if (tokenPrefixMatch(queryTokens, nameTokens)) return RANK_TOKEN_PREFIX
  }

  // --- Phone matching ---
  const phoneDigits = normalizePhoneDigits(customer.caller_phone)
  const queryDigits = normalizePhoneDigits(q)
  if (phoneDigits && queryDigits) {
    // Exact full phone (also try stripping a leading US country code "1" so
    // that "4125551234" matches "+1-412-555-1234").
    const phoneStripped = phoneDigits.length === 11 && phoneDigits.startsWith('1') ? phoneDigits.slice(1) : phoneDigits
    const queryStripped = queryDigits.length === 11 && queryDigits.startsWith('1') ? queryDigits.slice(1) : queryDigits
    if (phoneDigits === queryDigits || phoneStripped === queryStripped) return RANK_EXACT_PHONE
    // Phone-prefix (also try with country-code-stripped forms)
    if (phoneDigits.startsWith(queryDigits) || phoneStripped.startsWith(queryStripped)) return RANK_PHONE_PREFIX
  }

  return NO_MATCH
}

/**
 * Filter and deterministically sort customers by search relevance.
 * An empty query returns the original list unmodified.
 */
export function searchCustomers<T extends CustomerSearchable>(
  customers: T[],
  query: string
): T[] {
  if (!query.trim()) return customers
  return customers
    .map((c) => ({ c, rank: rankCustomerForQuery(c, query) }))
    .filter((entry) => entry.rank > 0)
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.c)
}
