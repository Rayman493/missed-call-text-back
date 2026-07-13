// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  // Reduced from 1.0 to 0.1 to limit transaction volume in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Filter out sensitive data
  beforeSend(event, hint) {
    // Don't send events in development
    if (process.env.NODE_ENV === 'development') {
      return null;
    }
    
    // Remove sensitive data from request headers
    if (event.request && event.request.headers) {
      const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
      sensitiveHeaders.forEach(header => {
        delete (event.request as any).headers[header];
      });
    }
    
    // Remove sensitive data from request body
    if (event.request?.data && typeof event.request.data === 'object' && event.request.data !== null) {
      const data = event.request.data as Record<string, any>;
      const sensitiveFields = [
        'password', 'token', 'apiKey', 'secret', 'authorization',
        'creditCard', 'cardNumber', 'cvv', 'expiry',
        'ssn', 'socialSecurityNumber',
        'phone', 'phoneNumber', 'caller_phone',
        'name', 'customer_name', 'caller_name',
        'message', 'sms_body', 'body', 'text',
        'voicemail', 'recording_url', 'audio_url',
        'payment', 'stripe', 'twilio',
        'raw_metadata', 'metadata'
      ];
      sensitiveFields.forEach(field => {
        delete data[field];
      });
    }
    
    // Remove sensitive data from query string
    if (event.request) {
      delete (event.request as any).query_string;
    }
    
    // Remove sensitive data from extra
    if (event.extra) {
      const extra = event.extra as Record<string, any>;
      const sensitiveFields = [
        'password', 'token', 'apiKey', 'secret', 'authorization',
        'creditCard', 'cardNumber', 'cvv', 'expiry',
        'ssn', 'socialSecurityNumber',
        'phone', 'phoneNumber', 'caller_phone',
        'name', 'customer_name', 'caller_name',
        'message', 'sms_body', 'body', 'text',
        'voicemail', 'recording_url', 'audio_url',
        'payment', 'stripe', 'twilio',
        'raw_metadata', 'metadata'
      ];
      sensitiveFields.forEach(field => {
        delete extra[field];
      });
    }
    
    // Remove sensitive data from breadcrumbs
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
        if (breadcrumb.data) {
          const data = breadcrumb.data as Record<string, any>;
          const sensitiveFields = [
            'password', 'token', 'apiKey', 'secret', 'authorization',
            'creditCard', 'cardNumber', 'cvv', 'expiry',
            'ssn', 'socialSecurityNumber',
            'phone', 'phoneNumber', 'caller_phone',
            'name', 'customer_name', 'caller_name',
            'message', 'sms_body', 'body', 'text',
            'voicemail', 'recording_url', 'audio_url',
            'payment', 'stripe', 'twilio',
            'raw_metadata', 'metadata'
          ];
          sensitiveFields.forEach(field => {
            delete data[field];
          });
        }
        return breadcrumb;
      });
    }
    
    return event;
  },
});
