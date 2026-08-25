# Action Modal Standardization - Before Matrix

## NewAppointmentModal
- **Shell width:** max-w-md
- **Max height:** max-h-[calc(85dvh-var(--bottom-nav-height,80px)-32px-env(safe-area-inset-top))] sm:max-h-[90vh]
- **Border radius:** rounded-t-xl sm:rounded-xl
- **Background:** bg-card
- **Border:** border border-border/30
- **Header padding:** px-5 py-4 sm:px-4 sm:py-3
- **Body padding:** px-5 py-4 sm:px-4 sm:py-3
- **Body gap:** space-y-4 sm:space-y-4
- **Footer padding:** px-5 py-4 sm:px-4 sm:py-3
- **Field heights:** px-4 py-2.5 sm:px-3 sm:py-2
- **Label typography:** text-xs text-muted-foreground font-medium mb-1.5
- **Button heights:** px-4 py-2.5 text-sm
- **Scroll container:** flex-1 min-h-0 overflow-y-auto with data-scroll-lock-allow
- **Portal/Z-index:** z-[60]
- **Mobile safe-area:** paddingTop: max(16px, env(safe-area-inset-top)) on backdrop, paddingBottom: max(16px, calc(16px + env(safe-area-inset-bottom))) on footer
- **Header icon:** Yes (Plus in bg-primary/10 container)
- **Subtitle:** Yes ("Add something to your calendar without creating a customer job.")
- **Theme tokens:** Uses bg-card, border-border/30 (theme-aware)

## NewTaskModal
- **Shell width:** max-w-md
- **Max height:** max-h-[calc(100dvh-var(--bottom-nav-height,80px)-32px)] sm:max-h-[90vh]
- **Border radius:** rounded-xl
- **Background:** bg-white dark:bg-slate-900 (HARDCODED)
- **Border:** none
- **Header padding:** p-4
- **Body padding:** p-4
- **Body gap:** space-y-4
- **Footer:** No separate footer - buttons inside form at bottom
- **Field heights:** px-3 py-2
- **Label typography:** text-sm font-medium text-slate-900 dark:text-foreground mb-1.5
- **Button heights:** px-4 py-2
- **Scroll container:** flex-1 min-h-0 overflow-y-auto (no data-scroll-lock-allow)
- **Portal/Z-index:** z-[60]
- **Mobile safe-area:** pb-[calc(var(--bottom-nav-height,80px)+env(safe-area-inset-bottom)+16px)] md:pb-4 on backdrop
- **Header icon:** No
- **Subtitle:** No
- **Theme tokens:** Uses hardcoded slate values (bg-white dark:bg-slate-900, border-slate-200 dark:border-slate-700, text-slate-900 dark:text-foreground)

## AddCustomerModal
- **Shell width:** max-w-lg (WIDER than others)
- **Max height:** max-h-[calc(100dvh-var(--bottom-nav-height,80px)-32px)] md:max-h-[90vh]
- **Border radius:** rounded-2xl (MORE rounded than others)
- **Background:** bg-card
- **Border:** border border-border/50
- **Header padding:** px-5 py-4
- **Body padding:** p-4 sm:p-6 (MORE padding than others)
- **Body gap:** space-y-4 sm:space-y-5 (MORE spacing than others)
- **Footer padding:** px-5 py-4
- **Field heights:** px-4 py-2.5
- **Label typography:** text-sm font-medium text-foreground mb-1.5 (LARGER than Appointment)
- **Button heights:** px-4 py-2.5 font-medium
- **Scroll container:** overflow-y-auto flex-1 overflow-x-hidden with data-scroll-lock-allow
- **Portal/Z-index:** z-[60]
- **Mobile safe-area:** pb-[calc(var(--bottom-nav-height,80px)+env(safe-area-inset-bottom)+16px)] md:pb-4 on backdrop
- **Header icon:** No
- **Subtitle:** No
- **Theme tokens:** Uses bg-card, border-border/50 (theme-aware)

## Key Differences Identified

1. **Shell width:** AddCustomer is max-w-lg vs max-w-md for others
2. **Border radius:** AddCustomer is rounded-2xl vs rounded-xl/rounded-t-xl
3. **Background:** NewTask uses hardcoded slate values
4. **Header:** NewAppointment has icon + subtitle, others don't
5. **Body spacing:** AddCustomer has significantly more spacing (sm:space-y-5 vs space-y-4)
6. **Body padding:** AddCustomer has more padding (sm:p-6 vs p-4)
7. **Footer:** NewTask has buttons inside form, others have separate footer
8. **Label size:** NewTask/AddCustomer use text-sm vs text-xs in NewAppointment
9. **Field heights:** NewTask uses px-3 py-2 vs px-4 py-2.5 in others
10. **Mobile safe-area:** Inconsistent implementations

## Canonical Contract (Based on NewAppointment as baseline)

**Desktop target:**
- Width: max-w-md (or max-w-lg for AddCustomer due to more content)
- Centered
- Border radius: rounded-xl (desktop), rounded-t-xl (mobile)
- Background: bg-card (theme-aware)
- Border: border border-border/30
- Max-height: constrained to viewport with safe-area considerations
- Single internal scroll region
- Fixed header/footer inside shell

**Mobile target:**
- Fit inside usable viewport
- Respect top safe area
- Remain above bottom navigation
- Preserve rounded corners on all four corners
- Internal body scroll
- Footer always reachable
- Keyboard does not push modal behind nav

**Shared header anatomy:**
- Padding: px-5 py-4 sm:px-4 sm:py-3
- Title: text-base font-semibold text-foreground tracking-tight
- Subtitle: text-xs text-muted-foreground/70 (optional)
- Icon: Optional, w-8 h-8 rounded-lg bg-primary/10
- Close button: p-1.5, aligned right

**Shared body spacing:**
- Section gap: space-y-4
- Label to field: mb-1.5
- Field to field: space-y-4

**Shared form controls:**
- Height: px-4 py-2.5 sm:px-3 sm:py-2
- Border radius: rounded-lg
- Background: bg-background
- Border: border border-border
- Focus ring: focus:ring-2 focus:ring-blue-500/50

**Shared footer anatomy:**
- Padding: px-5 py-4 sm:px-4 sm:py-3
- Border top: border-t border-border/30
- Background: bg-card
- Button height: px-4 py-2.5 text-sm font-medium
- Primary: bg-primary hover:bg-primary/90 text-primary-foreground
- Secondary: bg-muted hover:bg-muted/80 text-foreground
- Safe-area bottom: max(16px, calc(16px + env(safe-area-inset-bottom)))