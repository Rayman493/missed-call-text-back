'use client'

import { useRouter } from 'next/navigation'
import { User, Edit, Link2, ExternalLink, CreditCard, RefreshCw, X, Loader2 } from 'lucide-react'
import { showToast } from '@/lib/toast'

export interface PaymentActionBarPayment {
  id: string
  status: string
  checkout_url?: string | null
  payment_provider?: string | null
  payment_method_type?: string | null
  stripe_connect_account_id?: string | null
  leads?: { id: string } | null
}

export interface PaymentActionBarProps {
  payment: PaymentActionBarPayment
  canEdit: boolean
  isCancelling?: boolean
  isMarkingPaid?: boolean
  isMarkingUnpaid?: boolean
  isReconciling?: boolean
  onEdit?: () => void
  onCopyLink?: () => void
  onMarkPaid?: () => void
  onMarkUnpaid?: () => void
  onCheckStatus?: () => void
  onCancel?: () => void
  onManageInStripe?: () => void
}

const SLOT_ORDER: {
  key: string
  icon: typeof User
  title: string
  label: string
}[] = [
  { key: 'customer', icon: User, title: 'View Customer', label: 'Customer' },
  { key: 'edit', icon: Edit, title: 'Edit', label: 'Edit' },
  { key: 'copy', icon: Link2, title: 'Copy Link', label: 'Copy Link' },
  { key: 'open', icon: ExternalLink, title: 'Open Link', label: 'Open' },
  { key: 'status', icon: CreditCard, title: 'Mark Paid', label: 'Paid' },
  { key: 'cancel', icon: X, title: 'Cancel', label: 'Cancel' },
]

export default function PaymentActionBar({
  payment,
  canEdit,
  isCancelling,
  isMarkingPaid,
  isMarkingUnpaid,
  isReconciling,
  onEdit,
  onCopyLink,
  onMarkPaid,
  onMarkUnpaid,
  onCheckStatus,
  onCancel,
  onManageInStripe,
}: PaymentActionBarProps) {
  const router = useRouter()
  const status = payment.status
  const checkoutUrl = payment.checkout_url
  const provider = payment.payment_provider
  const methodType = payment.payment_method_type

  const canViewCustomer = !!payment.leads
  const canCopyOrOpen = status === 'pending' && !!checkoutUrl
  // Stripe-backed transactions carry a connected-account id; manual payments
  // (Venmo/PayPal/cash) never do. The handoff opens the Express dashboard —
  // it never issues a refund.
  const canManageInStripe =
    !!payment.stripe_connect_account_id &&
    provider !== 'venmo' &&
    provider !== 'paypal' &&
    !!onManageInStripe
  const canMarkPaid = status === 'pending' && (provider === 'paypal' || provider === 'venmo')
  const canMarkUnpaid =
    status === 'paid' &&
    (provider === 'paypal' || provider === 'venmo') &&
    methodType !== 'card_present'
  const canCheckStatus = status === 'pending' && methodType === 'card_present'
  const canCancel = status === 'pending' && !(methodType === 'card' && checkoutUrl)

  const statusSlot = canMarkUnpaid
    ? {
        icon: RefreshCw,
        title: 'Mark Unpaid',
        label: 'Unpaid',
        enabled: true,
        reason: '',
        loading: !!isMarkingUnpaid,
        onClick: onMarkUnpaid,
      }
    : canCheckStatus
    ? {
        icon: RefreshCw,
        title: 'Check Status',
        label: 'Check',
        enabled: true,
        reason: '',
        loading: !!isReconciling,
        onClick: onCheckStatus,
      }
    : {
        icon: CreditCard,
        title: 'Mark Paid',
        label: 'Paid',
        enabled: canMarkPaid,
        reason: canMarkPaid
          ? ''
          : status !== 'pending'
          ? 'Only pending payments can be marked paid.'
          : 'Only pending PayPal/Venmo payments can be marked paid.',
        loading: !!isMarkingPaid,
        onClick: onMarkPaid,
      }

  const slots = [
    {
      key: 'customer',
      icon: User,
      title: 'View Customer',
      label: 'Customer',
      enabled: canViewCustomer,
      reason: canViewCustomer ? '' : 'No customer is linked to this payment.',
      loading: false,
      onClick: () => payment.leads && router.push(`/dashboard/leads/${payment.leads.id}`),
    },
    {
      key: 'edit',
      icon: Edit,
      title: 'Edit',
      label: 'Edit',
      enabled: canEdit,
      reason: canEdit ? '' : 'Only pending, paid, failed, or cancelled payments can be renamed.',
      loading: false,
      onClick: onEdit,
    },
    {
      key: 'copy',
      icon: Link2,
      title: 'Copy Link',
      label: 'Copy Link',
      enabled: canCopyOrOpen,
      reason: canCopyOrOpen ? '' : 'No active payment link to copy.',
      loading: false,
      onClick: onCopyLink,
    },
    // 'Open Link' and 'Manage in Stripe' share this slot: a pending payment
    // with a checkout link keeps the existing behavior; otherwise the slot
    // becomes the Stripe dashboard handoff for eligible Stripe transactions.
    canCopyOrOpen
      ? {
          key: 'open',
          icon: ExternalLink,
          title: 'Open Link',
          label: 'Open',
          enabled: true,
          reason: '',
          loading: false,
          onClick: () => checkoutUrl && window.open(checkoutUrl, '_blank', 'noopener,noreferrer'),
        }
      : {
          key: 'open',
          icon: ExternalLink,
          title: 'Manage in Stripe',
          label: 'Stripe',
          enabled: canManageInStripe,
          reason: canManageInStripe ? '' : 'No active payment link to open.',
          loading: false,
          onClick: onManageInStripe,
        },
    { key: 'status', ...statusSlot },
    {
      key: 'cancel',
      icon: X,
      title: 'Cancel',
      label: 'Cancel',
      enabled: canCancel,
      reason: canCancel ? '' : 'Only pending payments can be cancelled.',
      loading: !!isCancelling,
      onClick: onCancel,
    },
  ]

  return (
    <div className="grid grid-cols-6 gap-1 w-full">
      {slots.map((slot) => {
        const Icon = slot.icon
        if (!slot.enabled) {
          return (
            <button
              key={slot.key}
              type="button"
              onClick={(e) => slot.reason && showToast(slot.reason, 'info', { anchor: e.currentTarget })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  slot.reason && showToast(slot.reason, 'info', { anchor: e.currentTarget })
                }
              }}
              aria-label={`${slot.title} unavailable`}
              title={`${slot.title} unavailable`}
              className="flex flex-col items-center justify-center gap-0.5 h-12 rounded-lg text-slate-300 dark:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 cursor-default"
            >
              <Icon className="w-4 h-4" />
              <span className="text-[9px] leading-none">{slot.label}</span>
            </button>
          )
        }

        return (
          <button
            key={slot.key}
            type="button"
            onClick={slot.onClick}
            disabled={slot.loading}
            aria-label={slot.title}
            title={slot.title}
            className="flex flex-col items-center justify-center gap-0.5 h-12 rounded-lg text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 transition-colors disabled:opacity-50"
          >
            {slot.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
            <span className="text-[9px] leading-none">{slot.label}</span>
          </button>
        )
      })}
    </div>
  )
}
