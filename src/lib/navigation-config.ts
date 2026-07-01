import { Home, Users, Calendar, CreditCard, Settings, ExternalLink, LogOut, CreditCard as BillingIcon } from 'lucide-react'
import { LucideIcon } from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  isActive?: (pathname: string) => boolean
}

export interface AccountMenuItem {
  label: string
  icon: LucideIcon
  href?: string
  external?: boolean
  action?: 'billing' | 'signout'
  variant?: 'default' | 'danger'
}

export const primaryNavItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: Home,
    isActive: (pathname) => pathname === '/dashboard',
  },
  {
    href: '/dashboard/leads',
    label: 'Leads',
    icon: Users,
    isActive: (pathname) => pathname === '/dashboard/leads' || pathname?.startsWith('/dashboard/leads/'),
  },
  {
    href: '/dashboard/calendar',
    label: 'Schedule',
    icon: Calendar,
    isActive: (pathname) => pathname === '/dashboard/calendar' || pathname?.startsWith('/dashboard/calendar/'),
  },
  {
    href: '/dashboard/payments',
    label: 'Payments',
    icon: CreditCard,
    isActive: (pathname) => pathname === '/dashboard/payments' || pathname?.startsWith('/dashboard/payments/'),
  },
]

export const accountMenuItems: AccountMenuItem[] = [
  {
    label: 'Account Settings',
    icon: Settings,
    href: '/dashboard/settings',
  },
  {
    label: 'Billing',
    icon: BillingIcon,
    action: 'billing',
  },
  {
    label: 'View Homepage',
    icon: ExternalLink,
    href: '/',
    external: true,
  },
  {
    label: 'Sign Out',
    icon: LogOut,
    action: 'signout',
    variant: 'danger',
  },
]
