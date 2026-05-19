interface BrandLoaderProps {
  size?: number
  className?: string
}

export default function BrandLoader({ size = 32, className = '' }: BrandLoaderProps) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="relative">
        <svg
          width={size}
          height={size}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="animate-pulse"
        >
          <defs>
            <linearGradient id="r-gradient-loader" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#3b82f6" />
              <stop offset="100%" stop-color="#2563eb" />
            </linearGradient>
          </defs>
          <rect width="48" height="48" rx="12" fill="url(#r-gradient-loader)" />
          <path
            d="M14 14V34H19V26H25C28.3137 26 31 23.3137 31 20C31 16.6863 28.3137 14 25 14H14ZM19 21V17H25C26.1046 17 27 17.8954 27 19C27 20.1046 26.1046 21 25 21H19Z"
            fill="white"
          />
        </svg>
        <div className="absolute inset-0 bg-blue-400 rounded-xl animate-ping opacity-20"></div>
      </div>
    </div>
  )
}
