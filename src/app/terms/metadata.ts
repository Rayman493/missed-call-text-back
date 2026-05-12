import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service - ReplyFlowHQ | Service Terms & Conditions',
  description: 'ReplyFlowHQ terms of service outline our missed-call text back automation services, pricing, and usage terms. Read our service terms and conditions.',
  keywords: ['terms of service', 'service terms', 'conditions', 'SMS terms', 'ReplyFlowHQ terms'],
  openGraph: {
    title: 'Terms of Service - ReplyFlowHQ | Service Terms & Conditions',
    description: 'ReplyFlowHQ terms of service outline our missed-call text back automation services, pricing, and usage terms. Read our service terms and conditions.',
    url: 'https://replyflowhq.com/terms',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ReplyFlowHQ Terms of Service - Service Terms & Conditions',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Terms of Service - ReplyFlowHQ | Service Terms & Conditions',
    description: 'ReplyFlowHQ terms of service outline our missed-call text back automation services, pricing, and usage terms. Read our service terms and conditions.',
    images: ['/og-image.png'],
  },
  alternates: {
    canonical: '/terms',
  },
}
