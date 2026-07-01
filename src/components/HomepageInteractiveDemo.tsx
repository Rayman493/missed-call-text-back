'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { motion } from 'framer-motion'

const InteractiveDemoWalkthrough = dynamic(
  () => import('@/components/InteractiveDemoWalkthrough'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full max-w-4xl mx-auto">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 sm:p-8 min-h-[300px] sm:min-h-[320px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading interactive demo...</p>
          </div>
        </div>
      </div>
    )
  }
)

export default function HomepageInteractiveDemo() {
  return (
    <section className="bg-white dark:bg-background py-12 sm:py-16 md:py-20 border-t border-slate-100 dark:border-slate-800">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          viewport={{ once: true }}
          className="text-center mb-8 sm:mb-10"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-foreground mb-3 sm:mb-4 tracking-tight">
            See How It Works
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
            Watch a customer journey unfold from missed call to booked appointment and payment.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          viewport={{ once: true }}
        >
          <InteractiveDemoWalkthrough compact={true} showHeader={true} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
          viewport={{ once: true }}
          className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4"
        >
          <Link
            href="/auth?mode=signup"
            className="inline-flex items-center justify-center h-12 px-6 sm:px-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-[2px] text-sm sm:text-base"
          >
            Start Your 14-Day Free Trial
          </Link>
          <Link
            href="/demo"
            className="inline-flex items-center justify-center h-12 px-6 sm:px-8 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition-all text-sm sm:text-base"
          >
            See the Full Demo
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
