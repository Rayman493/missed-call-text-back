interface BrandIconProps {
  size?: number
  className?: string
}

export default function BrandIcon({ size = 32, className = '' }: BrandIconProps) {
  return (
    <img
      src="/icon-192.png"
      alt="ReplyFlow"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain' }}
    />
  )
}
