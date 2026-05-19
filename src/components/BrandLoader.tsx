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
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="animate-pulse"
        >
          <rect width="32" height="32" rx="8" fill="#0f172a"/>
          <path
            d="M10 8V24H14V18H18C20.2091 18 22 16.2091 22 14C22 11.7909 20.2091 10 18 10H10ZM14 14V12H18C18.5523 12 19 12.4477 19 13C19 13.5523 18.5523 14 18 14H14Z"
            fill="#3b82f6"
          />
        </svg>
        <div className="absolute inset-0 bg-blue-400 rounded-lg animate-ping opacity-20"></div>
      </div>
    </div>
  )
}
