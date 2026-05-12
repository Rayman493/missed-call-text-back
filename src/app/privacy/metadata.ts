import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy - ReplyFlowHQ | Data Protection & Privacy',
  description: 'ReplyFlowHQ privacy policy explains how we collect, use, and protect customer data. Learn about our data protection practices for missed-call text back services.',
  keywords: ['privacy policy', 'data protection', 'customer privacy', 'SMS privacy', 'ReplyFlowHQ privacy'],
  openGraph: {
    title: 'Privacy Policy - ReplyFlowHQ | Data Protection & Privacy',
    description: 'ReplyFlowHQ privacy policy explains how we collect, use, and protect customer data. Learn about our data protection practices for missed-call text back services.',
    url: 'https://replyflowhq.com/privacy',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ReplyFlowHQ Privacy Policy - Data Protection & Privacy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Privacy Policy - ReplyFlowHQ | Data Protection & Privacy',
    description: 'ReplyFlowHQ privacy policy explains how we collect, use, and protect customer data. Learn about our data protection practices for missed-call text back services.',
    images: ['/og-image.png'],
  },
  alternates: {
    canonical: '/privacy',
  },
}
