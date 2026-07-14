'use client'

/**
 * TEMPORARY DIAGNOSTIC UTILITY FOR RADIX DROPDOWN SLIDE ANIMATION
 * This file should be removed after identifying and fixing the root cause.
 */

type ElementSnapshot = {
  label: string
  timestamp: number
  rect: {
    top: number
    left: number
    right: number
    bottom: number
    width: number
    height: number
  }
  computed: {
    position: string
    top: string
    left: string
    right: string
    bottom: string
    transform: string
    translate: string
    scale: string
    opacity: string
    transition: string
    transitionProperty: string
    transitionDuration: string
    transitionDelay: string
    animationName: string
    animationDuration: string
    animationDelay: string
    transformOrigin: string
    willChange: string
  }
}

function captureElementSnapshot(label: string, element: HTMLElement): ElementSnapshot {
  const style = window.getComputedStyle(element)
  const rect = element.getBoundingClientRect()

  return {
    label,
    timestamp: performance.now(),
    rect: {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    },
    computed: {
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      bottom: style.bottom,
      transform: style.transform,
      translate: style.translate,
      scale: style.scale,
      opacity: style.opacity,
      transition: style.transition,
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
      transitionDelay: style.transitionDelay,
      animationName: style.animationName,
      animationDuration: style.animationDuration,
      animationDelay: style.animationDelay,
      transformOrigin: style.transformOrigin,
      willChange: style.willChange,
    },
  }
}

export function debugDropdownOpening(name: string) {
  if (process.env.NODE_ENV !== 'development') return

  const selector = `[data-dropdown-debug="${name}"]`

  const capture = (phase: string) => {
    const content = document.querySelector<HTMLElement>(selector)
    if (!content) {
      console.log(`[Dropdown Debug] ${name} ${phase}: content not found`)
      return
    }

    const wrapper = content.closest<HTMLElement>('[data-radix-popper-content-wrapper]')

    console.log(`[Dropdown Debug] ${name} ${phase}`, {
      content: captureElementSnapshot('content', content),
      wrapper: wrapper ? captureElementSnapshot('wrapper', wrapper) : null,
    })
  }

  capture('immediate')

  requestAnimationFrame(() => {
    capture('raf-1')

    requestAnimationFrame(() => {
      capture('raf-2')
    })
  })

  setTimeout(() => capture('50ms'), 50)
  setTimeout(() => capture('100ms'), 100)
  setTimeout(() => capture('200ms'), 200)
  setTimeout(() => capture('400ms'), 400)
}

export function findMatchingCssRules(element: Element) {
  if (process.env.NODE_ENV !== 'development') return []

  const matches: Array<{
    href: string | null
    selector: string
    cssText: string
  }> = []

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList

    try {
      rules = sheet.cssRules
    } catch {
      continue
    }

    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule)) continue

      try {
        if (element.matches(rule.selectorText)) {
          matches.push({
            href: sheet.href,
            selector: rule.selectorText,
            cssText: rule.style.cssText,
          })
        }
      } catch {
        // Ignore unsupported selectors
      }
    }
  }

  return matches
}

export function observeWrapperStyleChanges(wrapper: HTMLElement) {
  if (process.env.NODE_ENV !== 'development') return

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        console.log('[Dropdown Debug] wrapper style changed', {
          style: wrapper.getAttribute('style'),
          rect: wrapper.getBoundingClientRect(),
        })
      }
    }
  })

  observer.observe(wrapper, {
    attributes: true,
    attributeFilter: ['style', 'class'],
  })

  return observer
}
