/**
 * Payment link generation utilities for multi-provider payment requests
 * Supports Stripe, Venmo, and PayPal
 */

export type PaymentProvider = 'stripe' | 'venmo' | 'paypal';

export interface PaymentLinkResult {
  link: string;
  provider: PaymentProvider;
  error?: string;
}

/**
 * Normalize Venmo username by removing @ prefix if present
 */
export function normalizeVenmoUsername(username: string | null | undefined): string | null {
  if (!username) return null;
  
  // Remove @ prefix if present
  const normalized = username.trim().replace(/^@/, '');
  
  // Return null if empty after normalization
  return normalized || null;
}

/**
 * Generate Venmo payment link
 * Uses canonical Venmo profile URL: https://venmo.com/u/{username}
 * Prefilled parameters (amount, note) are NOT supported by Venmo in production
 * Real-device testing shows Universal Links with parameters redirect to homepage
 * This provides a reliable handoff to the merchant's Venmo profile
 */
export function generateVenmoLink(
  username: string | null | undefined,
  amountCents?: number | null,
  note?: string | null
): PaymentLinkResult {
  const normalized = normalizeVenmoUsername(username);
  
  if (!normalized) {
    return {
      link: '',
      provider: 'venmo',
      error: 'Invalid Venmo username'
    };
  }

  // Use canonical Venmo profile URL
  // Prefilled parameters (amount, note, txn) are not supported in production
  // Real-device testing shows these cause redirects to homepage
  const finalUrl = `https://venmo.com/u/${normalized}`;
  console.log('[VENMO LINK] Generated profile URL:', finalUrl);
  
  return {
    link: finalUrl,
    provider: 'venmo'
  };
}

/**
 * Normalize PayPal payment link
 * Handles both paypal.me/... format and full URLs
 */
export function normalizePaypalLink(link: string | null | undefined): string | null {
  if (!link) return null;
  
  const normalized = link.trim();
  
  // If already a full URL, return as-is
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalized;
  }
  
  // If it's a paypal.me handle without protocol, add https://
  if (normalized.startsWith('paypal.me/')) {
    return `https://${normalized}`;
  }
  
  // If it's just a handle, convert to paypal.me format
  if (!normalized.includes('/')) {
    return `https://paypal.me/${normalized}`;
  }
  
  return normalized || null;
}

/**
 * Generate PayPal payment link with optional amount
 * Format: https://paypal.me/{username}/{amount}
 * Note: PayPal.Me does not support note/description in URL
 */
export function generatePaypalLink(
  link: string | null | undefined,
  amountCents?: number | null
): PaymentLinkResult {
  const normalized = normalizePaypalLink(link);
  
  if (!normalized) {
    return {
      link: '',
      provider: 'paypal',
      error: 'Invalid PayPal payment link'
    };
  }

  try {
    // If amount is provided, append it to the PayPal.Me link
    if (amountCents && amountCents > 0) {
      const amountDollars = (amountCents / 100).toFixed(2);
      
      // Parse the URL to extract the username/handle
      const url = new URL(normalized);
      const pathname = url.pathname;
      
      // Remove trailing slash and append amount
      const cleanPathname = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
      const newUrl = `${url.origin}${cleanPathname}/${amountDollars}`;
      
      return {
        link: newUrl,
        provider: 'paypal'
      };
    }
    
    return {
      link: normalized,
      provider: 'paypal'
    };
  } catch (error) {
    console.error('[PAYPAL LINK] Failed to generate dynamic link:', error);
    // Fallback to original link
    return {
      link: normalized,
      provider: 'paypal',
      error: 'Failed to generate dynamic link, using original link'
    };
  }
}

/**
 * Check if a payment provider is available for a business
 */
export function isProviderAvailable(
  provider: PaymentProvider,
  business: {
    stripe_connect_account_id?: string | null;
    stripe_connect_status?: string | null;
    stripe_charges_enabled?: boolean | null;
    venmo_username?: string | null;
    paypal_payment_link?: string | null;
  }
): boolean {
  switch (provider) {
    case 'stripe':
      // Stripe is available if connected and charges are enabled
      return !!(
        business.stripe_connect_account_id &&
        business.stripe_connect_status === 'connected' &&
        business.stripe_charges_enabled === true
      );
    
    case 'venmo':
      // Venmo is available if username is configured
      return !!normalizeVenmoUsername(business.venmo_username);
    
    case 'paypal':
      // PayPal is available if payment link is configured
      return !!normalizePaypalLink(business.paypal_payment_link);
    
    default:
      return false;
  }
}

/**
 * Get available payment providers for a business
 */
export function getAvailableProviders(
  business: {
    stripe_connect_account_id?: string | null;
    stripe_connect_status?: string | null;
    stripe_charges_enabled?: boolean | null;
    venmo_username?: string | null;
    paypal_payment_link?: string | null;
  }
): PaymentProvider[] {
  const providers: PaymentProvider[] = [];
  
  if (isProviderAvailable('stripe', business)) {
    providers.push('stripe');
  }
  
  if (isProviderAvailable('venmo', business)) {
    providers.push('venmo');
  }
  
  if (isProviderAvailable('paypal', business)) {
    providers.push('paypal');
  }
  
  return providers;
}

/**
 * Generate payment link for a specific provider with optional amount and note
 */
export function generatePaymentLink(
  provider: PaymentProvider,
  business: {
    venmo_username?: string | null;
    paypal_payment_link?: string | null;
  },
  amountCents?: number | null,
  note?: string | null
): PaymentLinkResult {
  switch (provider) {
    case 'venmo':
      return generateVenmoLink(business.venmo_username, amountCents, note);
    
    case 'paypal':
      return generatePaypalLink(business.paypal_payment_link, amountCents);
    
    case 'stripe':
      // Stripe links are generated dynamically via checkout sessions
      // This is handled separately in the payment request flow
      return {
        link: '',
        provider: 'stripe',
        error: 'Stripe links are generated via checkout session'
      };
    
    default:
      return {
        link: '',
        provider: provider,
        error: 'Unknown payment provider'
      };
  }
}
