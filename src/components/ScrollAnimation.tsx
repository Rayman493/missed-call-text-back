'use client'

import { useEffect, useRef, useState } from 'react'

interface ScrollAnimationProps {
  children: React.ReactNode
  className?: string
  delay?: number
  disabledOnMobile?: boolean
}

export default function ScrollAnimation({ children, className = '', delay = 0, disabledOnMobile = false }: ScrollAnimationProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [hasAnimated, setHasAnimated] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Check if on mobile and animations are disabled
    const isMobile = window.innerWidth < 768
    if (prefersReducedMotion || (disabledOnMobile && isMobile)) {
      setIsVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setIsVisible(true)
          setHasAnimated(true)
        }
      },
      {
        threshold: 0.15, // Trigger when 15% visible
        rootMargin: isMobile ? '0px 0px -100px 0px' : '0px 0px -50px 0px', // Earlier trigger on mobile
      }
    )

    observer.observe(element)

    return () => {
      observer.unobserve(element)
    }
  }, [hasAnimated, disabledOnMobile])

  return (
    <div
      ref={ref}
      className={`transition-all duration-500 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      } ${className}`}
      style={{
        transitionDelay: delay ? `${delay}ms` : undefined,
      }}
    >
      {children}
    </div>
  )
}
