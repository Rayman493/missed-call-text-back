import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Compliance - ReplyFlowHQ | SMS Marketing & Data Privacy',
  description: 'ReplyFlowHQ complies with TCPA, GDPR, and data privacy regulations. Learn about our SMS marketing compliance and customer data protection practices.',
  keywords: ['SMS compliance', 'TCPA compliance', 'GDPR compliance', 'data privacy', 'ReplyFlowHQ compliance'],
  openGraph: {
    title: 'Compliance - ReplyFlowHQ | SMS Marketing & Data Privacy',
    description: 'ReplyFlowHQ complies with TCPA, GDPR, and data privacy regulations. Learn about our SMS marketing compliance and customer data protection practices.',
    url: 'https://replyflowhq.com/compliance',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ReplyFlowHQ Compliance - SMS Marketing & Data Privacy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Compliance - ReplyFlowHQ | SMS Marketing & Data Privacy',
    description: 'ReplyFlowHQ complies with TCPA, GDPR, and data privacy regulations. Learn about our SMS marketing compliance and customer data protection practices.',
    images: ['/og-image.png'],
  },
  alternates: {
    canonical: '/compliance',
  },
}
