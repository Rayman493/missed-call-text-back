const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://checkout.stripe.com https://*.sentry.io https://maps.googleapis.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://maps.googleapis.com; img-src 'self' data: blob: https: https://maps.gstatic.com https://maps.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.sentry.io https://*.ingest.sentry.io https://api.twilio.com https://*.twilio.com https://maps.googleapis.com https://*.googleapis.com https://www.gstatic.com; frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com https://www.google.com; media-src 'self' blob: https://*.twilio.com https://api.twilio.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"
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
  // Externalize the entire @react-pdf/renderer → pdfkit dependency chain.
  // @react-pdf/renderer depends on pdfkit, which dynamically requires
  // `pdfkit/standard-fonts/Helvetica.cjs` (and other font files) at
  // runtime via subpath exports. When Next.js bundles pdfkit into the
  // server route, the dynamic subpath requires are not traced and the
  // files are missing from the Vercel serverless function output, causing
  // `Cannot find module .../pdfkit/js/standard-fonts/Helvetica.cjs`.
  // Externalizing pdfkit (and @react-pdf/font, which loads fonts) keeps
  // the entire package in node_modules where the subpath exports resolve
  // correctly at runtime.
  serverExternalPackages: [
    '@supabase/supabase-js',
    '@react-pdf/font',
    'pdfkit',
  ],
  outputFileTracingRoot: __dirname,
  // Explicitly include pdfkit's standard-fonts and chunks directories in
  // the output file trace for the PDF route. pdfkit loads font files
  // dynamically via `require('pdfkit/standard-fonts/Helvetica')` at
  // runtime; Next.js's tracer cannot follow these dynamic requires, so
  // the font files are missing from the Vercel serverless function
  // output even though pdfkit is externalized. This ensures the entire
  // pdfkit package (including all standard fonts and chunk files) is
  // included in the deployable server artifact.
  outputFileTracingIncludes: {
    '/api/billing-documents/[id]/pdf': [
      './node_modules/pdfkit/js/standard-fonts/**/*',
      './node_modules/pdfkit/js/chunks/**/*',
      './node_modules/pdfkit/js/*.cjs',
      './node_modules/pdfkit/js/*.mjs',
      './node_modules/@react-pdf/font/lib/**/*',
    ],
  },
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
