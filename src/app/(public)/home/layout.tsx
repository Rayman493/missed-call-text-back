import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ReplyFlow — Customers, Scheduling & Payments for Service Businesses',
  description: 'Capture customer requests with AI, manage conversations and jobs, schedule work, and accept payments from one place. Built for local service businesses.',
  alternates: {
    canonical: 'https://replyflowhq.com/',
  },
  robots: {
    index: false,
    follow: false,
  },
}

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}