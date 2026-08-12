import { NextResponse } from 'next/server'

/**
 * Apple App Site Association (AASA) for Universal Links and Web Credentials
 *
 * This endpoint serves the AASA file at /.well-known/apple-app-site-association
 * which iOS uses to verify that this domain is allowed to open the ReplyFlow app
 * and to associate credentials for ASWebAuthenticationSession HTTPS callbacks.
 *
 * IMPORTANT: This file must be:
 * - Served over HTTPS
 * - Accessible without authentication
 * - No redirects
 * - Content-Type: application/json (or application/pkcs7-mime for signed)
 * - No .json extension
 *
 * The appID format is: TEAMID.bundle.identifier
 * - Team ID: 6K8XY33M7H (from Apple Developer App ID page)
 * - Bundle identifier: com.replyflowhq.app
 *
 * Universal Link scope is limited to /billing/success path for security.
 *
 * Web credentials association enables ASWebAuthenticationSession HTTPS callback matching
 * for native iOS Stripe checkout return flow.
 *
 * IMPORTANT LIMITATION:
 * Apple's documentation states that Universal Links are NOT activated when navigation
 * is initiated by an HTTP redirect. Since Stripe redirects from checkout.stripe.com to
 * www.replyflowhq.com via HTTP 302, the Universal Link may not activate in this scenario.
 * The ASWebAuthenticationSession HTTPS callback (webcredentials) provides automatic
 * return-to-app behavior without requiring Universal Link activation on redirects.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const aasa = {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: ['6K8XY33M7H.com.replyflowhq.app'],
          components: [
            {
              '/': '/billing/success',
              comment: 'Stripe checkout return path for native iOS (exact match)'
            }
          ]
        }
      ]
    },
    webcredentials: {
      apps: ['6K8XY33M7H.com.replyflowhq.app']
    }
  }

  return NextResponse.json(aasa, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    },
  })
}