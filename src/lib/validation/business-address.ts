/**
 * Business Address Validation Utility
 *
 * Validates and normalizes merchant business addresses for ReplyFlow.
 * Used by signup, Business Settings, and Terminal Location creation.
 */

export interface BusinessAddress {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface AddressValidationError {
  field: string;
  message: string;
}

export interface AddressValidationResult {
  valid: boolean;
  errors: AddressValidationError[];
  normalized?: BusinessAddress;
}

// Valid US state/territory codes
const VALID_US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'AS', 'GU', 'MP', 'PR', 'VI'
]);

/**
 * Validate and normalize a US business address
 */
export function validateBusinessAddress(address: Partial<BusinessAddress>): AddressValidationResult {
  const errors: AddressValidationError[] = [];

  // Validate line1 (required)
  const line1 = address.line1?.trim();
  if (!line1 || line1.length === 0) {
    errors.push({ field: 'line1', message: 'Street address is required' });
  }

  // Validate city (required)
  const city = address.city?.trim();
  if (!city || city.length === 0) {
    errors.push({ field: 'city', message: 'City is required' });
  }

  // Validate state (required)
  const state = address.state?.trim().toUpperCase();
  if (!state || state.length === 0) {
    errors.push({ field: 'state', message: 'State is required' });
  } else if (!VALID_US_STATES.has(state)) {
    errors.push({ field: 'state', message: 'Invalid state code' });
  }

  // Validate postal code (required)
  const postal_code = address.postal_code?.trim();
  if (!postal_code || postal_code.length === 0) {
    errors.push({ field: 'postal_code', message: 'ZIP code is required' });
  } else if (!/^\d{5}(-\d{4})?$/.test(postal_code)) {
    errors.push({ field: 'postal_code', message: 'Invalid ZIP code format (use 12345 or 12345-6789)' });
  }

  // Validate country (required, normalize to US)
  const country = address.country?.trim().toUpperCase();
  if (!country || country.length === 0) {
    errors.push({ field: 'country', message: 'Country is required' });
  } else if (country !== 'US') {
    errors.push({ field: 'country', message: 'Only US addresses are currently supported' });
  }

  // line2 is optional
  const line2 = address.line2?.trim() || null;

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Return normalized address
  return {
    valid: true,
    errors: [],
    normalized: {
      line1: line1!,
      line2,
      city: city!,
      state: state!,
      postal_code: postal_code!,
      country: 'US'
    }
  };
}

/**
 * Check if an address is complete (all required fields present)
 */
export function isAddressComplete(address: Partial<BusinessAddress> | null | undefined): boolean {
  if (!address) return false;
  return !!(
    address.line1?.trim() &&
    address.city?.trim() &&
    address.state?.trim() &&
    address.postal_code?.trim() &&
    address.country?.trim()
  );
}