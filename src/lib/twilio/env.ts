// Twilio Environment Variable Validation and Configuration
// This module provides centralized validation and configuration for Twilio environment variables

export interface TwilioEnvConfig {
  accountSid: string | null;
  authToken: string | null;
  phoneNumber: string | null;
  messagingServiceSid: string | null;
  simulateSms: boolean;
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

export function validateTwilioEnv(): TwilioEnvConfig {
  const config: TwilioEnvConfig = {
    accountSid: process.env.TWILIO_ACCOUNT_SID || null,
    authToken: process.env.TWILIO_AUTH_TOKEN || null,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || null,
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || null,
    simulateSms: process.env.SIMULATE_SMS === 'true',
    isValid: false,
    warnings: [],
    errors: []
  };

  // Validate required environment variables
  if (!config.accountSid) {
    config.errors.push('TWILIO_ACCOUNT_SID is required');
  } else if (!config.accountSid.startsWith('AC')) {
    config.errors.push('TWILIO_ACCOUNT_SID must start with "AC"');
  }

  if (!config.authToken) {
    config.errors.push('TWILIO_AUTH_TOKEN is required');
  } else if (config.authToken.length < 32) {
    config.errors.push('TWILIO_AUTH_TOKEN appears to be too short (should be at least 32 characters)');
  }

  // Validate optional environment variables with warnings
  if (!config.phoneNumber) {
    config.warnings.push('TWILIO_PHONE_NUMBER is not set - legacy fallback unavailable');
  } else if (!config.phoneNumber.startsWith('+')) {
    config.warnings.push('TWILIO_PHONE_NUMBER should start with "+" and include country code');
  }

  if (!config.messagingServiceSid) {
    config.warnings.push('TWILIO_MESSAGING_SERVICE_SID is not set - 10DLC messaging unavailable, will use phone number fallback');
  } else if (!config.messagingServiceSid.startsWith('MG')) {
    config.warnings.push('TWILIO_MESSAGING_SERVICE_SID should start with "MG"');
  }

  // Validate SIMULATE_SMS (development/testing mode)
  if (config.simulateSms) {
    config.warnings.push('SIMULATE_SMS=true - SMS will be simulated, no real messages sent (development/testing mode only)');
  }

  // Determine overall validity
  config.isValid = config.errors.length === 0;

  return config;
}

export function logTwilioEnvStatus(): void {
  const config = validateTwilioEnv();

  console.log('[Twilio Env] Starting environment validation...');
  
  if (config.isValid) {
    console.log('[Twilio Env] ✅ Required Twilio environment variables are valid');
  } else {
    console.error('[Twilio Env] ❌ Twilio environment validation failed:');
    config.errors.forEach(error => console.error(`[Twilio Env]   - ${error}`));
  }

  if (config.warnings.length > 0) {
    console.warn('[Twilio Env] ⚠️  Twilio environment warnings:');
    config.warnings.forEach(warning => console.warn(`[Twilio Env]   - ${warning}`));
  }

  // Log configuration summary (without sensitive data)
  console.log('[Twilio Env] Configuration summary:');
  console.log(`[Twilio Env]   - Account SID: ${config.accountSid ? `${config.accountSid.substring(0, 8)}...` : 'not set'}`);
  console.log(`[Twilio Env]   - Auth Token: ${config.authToken ? 'present' : 'not set'}`);
  console.log(`[Twilio Env]   - Phone Number: ${config.phoneNumber || 'not set'}`);
  console.log(`[Twilio Env]   - Messaging Service SID: ${config.messagingServiceSid ? `${config.messagingServiceSid.substring(0, 8)}...` : 'not set'}`);
  console.log(`[Twilio Env]   - 10DLC Ready: ${config.messagingServiceSid ? '✅' : '❌ (will use phone number fallback)'}`);
  console.log(`[Twilio Env]   - SMS Simulation: ${config.simulateSms ? '🧪 ENABLED (development/testing)' : '✅ DISABLED (real SMS)'}`);
  console.log('[Twilio Env] Environment validation complete');
}

export function getTwilioConfig(): TwilioEnvConfig {
  const config = validateTwilioEnv();
  
  // Log warnings for missing messaging service but don't break
  if (!config.messagingServiceSid) {
    console.warn('[Twilio Config] ⚠️  TWILIO_MESSAGING_SERVICE_SID not set - SMS will use phone number fallback (not 10DLC ready)');
  }
  
  return config;
}

// Runtime validation for critical Twilio operations
export function validateTwilioForSms(): { isValid: boolean; error?: string; method: 'messaging-service' | 'phone-number' | 'simulated' | 'none' } {
  const config = validateTwilioEnv();
  
  // If simulation mode is enabled, always allow it (even without credentials)
  if (config.simulateSms) {
    console.log('[Twilio SMS] 🧪 SMS simulation mode enabled - no real messages will be sent');
    return { isValid: true, method: 'simulated' };
  }
  
  if (!config.isValid) {
    return {
      isValid: false,
      error: 'Required Twilio credentials are missing or invalid',
      method: 'none'
    };
  }

  // Determine SMS sending method
  if (config.messagingServiceSid) {
    return { isValid: true, method: 'messaging-service' };
  } else if (config.phoneNumber) {
    console.warn('[Twilio SMS] Using phone number fallback - not 10DLC ready');
    return { isValid: true, method: 'phone-number' };
  } else {
    return {
      isValid: false,
      error: 'No valid SMS sending method available - missing both messaging service SID and phone number',
      method: 'none'
    };
  }
}

// Runtime validation for voice operations
export function validateTwilioForVoice(): { isValid: boolean; error?: string } {
  const config = validateTwilioEnv();
  
  if (!config.isValid) {
    return {
      isValid: false,
      error: 'Required Twilio credentials are missing or invalid'
    };
  }

  // Voice operations don't require messaging service or phone number
  // They use the Twilio account directly
  return { isValid: true };
}
