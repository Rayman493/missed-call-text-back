// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Reduce sampling rate to prevent monitoring spam during setup/loading
  // Only sample 10% of transactions in production, 0% in development
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Filter out sensitive data
  beforeSend(event, hint) {
    // Don't send events in development
    if (process.env.NODE_ENV === 'development') {
      return null;
    }
    
    // Add custom context if available
    if (typeof window !== 'undefined') {
      event.contexts = {
        ...event.contexts,
        app: {
          ...event.contexts?.app,
          url: window.location.href,
          userAgent: navigator.userAgent,
        },
      };
    }
    
    return event;
  },
});
