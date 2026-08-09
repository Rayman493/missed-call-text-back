'use client'

import { useState, useEffect } from 'react'

interface DownloadSectionProps {
  appStoreUrl: string | null
  googlePlayUrl: string | null
}

export function DownloadSection({ appStoreUrl, googlePlayUrl }: DownloadSectionProps) {
  const [deviceType, setDeviceType] = useState<'ios' | 'android' | 'desktop' | null>(null)

  useEffect(() => {
    // Lightweight client-side device detection
    const ua = navigator.userAgent.toLowerCase()
    
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
      setDeviceType('ios')
    } else if (ua.includes('android')) {
      setDeviceType('android')
    } else {
      setDeviceType('desktop')
    }
  }, [])

  // Show both options while detecting, or if device type is desktop/unknown
  const showBoth = deviceType === null || deviceType === 'desktop'
  const emphasizeIOS = deviceType === 'ios'
  const emphasizeAndroid = deviceType === 'android'

  return (
    <div className="space-y-4">
      {/* iOS Download */}
      <div className={`${emphasizeIOS ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800' : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700'} rounded-2xl p-4 sm:p-5 transition-all`}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-slate-600 dark:text-slate-300" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className={`font-semibold text-base ${emphasizeIOS ? 'text-blue-900 dark:text-blue-100' : 'text-slate-900 dark:text-white'}`}>
                Download on the App Store
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                For iPhone and iPad
              </p>
            </div>
          </div>
          {appStoreUrl ? (
            <a
              href={appStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors duration-200 shadow-sm hover:shadow"
            >
              Download
            </a>
          ) : (
            <div className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 bg-slate-200 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-sm font-medium rounded-lg cursor-not-allowed">
              Coming Soon
            </div>
          )}
        </div>
      </div>

      {/* Android Download */}
      <div className={`${emphasizeAndroid ? 'bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-800' : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700'} rounded-2xl p-4 sm:p-5 transition-all`}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-slate-600 dark:text-slate-300" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z"/>
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className={`font-semibold text-base ${emphasizeAndroid ? 'text-emerald-900 dark:text-emerald-100' : 'text-slate-900 dark:text-white'}`}>
                Get it on Google Play
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                For Android devices
              </p>
            </div>
          </div>
          {googlePlayUrl ? (
            <a
              href={googlePlayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors duration-200 shadow-sm hover:shadow"
            >
              Download
            </a>
          ) : (
            <div className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 bg-slate-200 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-sm font-medium rounded-lg cursor-not-allowed">
              Coming Soon
            </div>
          )}
        </div>
      </div>

      {!appStoreUrl && !googlePlayUrl && deviceType === 'desktop' && (
        <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-center">
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Mobile apps coming soon. Continue using ReplyFlow on the web for full functionality.
          </p>
        </div>
      )}
    </div>
  )
}
