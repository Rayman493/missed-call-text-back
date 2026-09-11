'use client'

/**
 * MobileHiddenSSRSafeNavbar
 *
 * Wraps SSRSafeNavbar so it only renders at `sm` and above. On mobile, the
 * public FAQ / Privacy / Terms / Compliance pages omit the standard public
 * header (hamburger, centered logo, avatar, redundant top nav). The
 * DocumentationHero already provides a Back control and the horizontal
 * section navigation (FAQ / Privacy / Terms / Compliance).
 *
 * Desktop public navigation remains unchanged.
 */

import SSRSafeNavbar from '@/components/SSRSafeNavbar'

export default function MobileHiddenSSRSafeNavbar(props: { forceDark?: boolean }) {
  return (
    <div className="hidden sm:block">
      <SSRSafeNavbar {...props} />
    </div>
  )
}
