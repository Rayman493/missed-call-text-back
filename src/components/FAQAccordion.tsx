'use client'

import { useState } from 'react'

interface FAQItem {
  question: string
  answer: string | string[]
}

interface FAQAccordionProps {
  items: FAQItem[]
}

export default function FAQAccordion({ items }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggleItem = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleItem(index)
    }
  }

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div
          key={index}
          className="border border-border rounded-lg overflow-hidden bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
        >
          <button
            onClick={() => toggleItem(index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`w-full px-6 py-4 text-left flex items-center justify-between transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${
              openIndex === index ? 'bg-muted' : ''
            }`}
            aria-expanded={openIndex === index}
            aria-controls={`faq-answer-${index}`}
            id={`faq-question-${index}`}
          >
            <span className="text-base font-medium text-foreground pr-4">
              {item.question}
            </span>
            <svg
              className={`w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${
                openIndex === index ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          <div
            id={`faq-answer-${index}`}
            role="region"
            aria-labelledby={`faq-question-${index}`}
            className={`overflow-hidden transition-all duration-200 ease-in-out ${
              openIndex === index ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="px-6 pb-4 pt-0">
              <div className="text-muted-foreground text-sm leading-relaxed">
                {Array.isArray(item.answer) ? (
                  <ol className="list-decimal list-inside space-y-1">
                    {item.answer.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ol>
                ) : (
                  <p>{item.answer}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
