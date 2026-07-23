const { withSentryConfig } = require("@sentry/nextjs");
const fs = require('fs');
const path = require('path');

// Debug logs to verify root resolution and app dir detection
try {
  // eslint-disable-next-line no-console
  console.log('[next.config] __dirname:', __dirname);
  // eslint-disable-next-line no-console
  console.log('[next.config] process.cwd():', process.cwd());
  // eslint-disable-next-line no-console
  console.log('[next.config] exists app:', fs.existsSync(path.join(__dirname, 'app')));
  // eslint-disable-next-line no-console
  console.log('[next.config] exists src/app:', fs.existsSync(path.join(__dirname, 'src', 'app')));
  // eslint-disable-next-line no-console
  console.log('[next.config] package.json at project root exists:', fs.existsSync(path.join(__dirname, 'package.json')));
  // eslint-disable-next-line no-console
  const oneUp = path.dirname(__dirname);
  const twoUp = path.dirname(oneUp);
  console.log('[next.config] parent lockfile (one up) exists:', fs.existsSync(path.join(oneUp, 'package-lock.json')));
  console.log('[next.config] parent lockfile (two up) exists:', fs.existsSync(path.join(twoUp, 'package-lock.json')));
} catch {}

/** @type {import('next').NextConfig} */
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://checkout.stripe.com https://*.sentry.io; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.sentry.io https://*.ingest.sentry.io https://api.twilio.com https://*.twilio.com; frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com; media-src 'self' blob: https://*.twilio.com https://api.twilio.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(self)'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  }
]

const nextConfig = {
  serverExternalPackages: ['@supabase/supabase-js'],
  outputFileTracingRoot: __dirname,
  eslint: {
    // Allow warnings during production build - ESLint still runs locally
    ignoreDuringBuilds: true
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  }
}

module.exports = withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Automatically annotate React components to show their full name in breadcrumbs and session replay
  reactComponentAnnotation: {
    enabled: true,
  },

  // Route browser requests to Sentry through a custom proxy domain
  tunnelRoute: "/monitoring",

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
});
