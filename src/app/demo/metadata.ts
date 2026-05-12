import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Demo - ReplyFlowHQ | See Missed-Call Text Back in Action',
  description: 'See how ReplyFlowHQ automatically texts customers back when you miss a call. Watch our demo to learn how local businesses capture more leads.',
  keywords: ['missed call text back demo', 'SMS automation demo', 'lead capture demo', 'ReplyFlowHQ demo'],
  openGraph: {
    title: 'Demo - ReplyFlowHQ | See Missed-Call Text Back in Action',
    description: 'See how ReplyFlowHQ automatically texts customers back when you miss a call. Watch our demo to learn how local businesses capture more leads.',
    url: 'https://replyflowhq.com/demo',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ReplyFlowHQ Demo - Missed-Call Text Back Automation',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Demo - ReplyFlowHQ | See Missed-Call Text Back in Action',
    description: 'See how ReplyFlowHQ automatically texts customers back when you miss a call. Watch our demo to learn how local businesses capture more leads.',
    images: ['/og-image.png'],
  },
  alternates: {
    canonical: '/demo',
  },
}
