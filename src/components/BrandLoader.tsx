interface BrandLoaderProps {
  size?: number
  className?: string
}

export default function BrandLoader({ size = 32, className = '' }: BrandLoaderProps) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="relative">
        <img
          src="/replyflow-r-logo.png"
          alt="ReplyFlow"
          width={size}
          height={size}
          className="animate-pulse"
          style={{ objectFit: 'contain' }}
        />
        <div className="absolute inset-0 bg-blue-400 rounded-lg animate-ping opacity-20"></div>
      </div>
    </div>
  )
}
