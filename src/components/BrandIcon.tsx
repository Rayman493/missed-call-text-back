interface BrandIconProps {
  size?: number
  className?: string
}

export default function BrandIcon({ size = 32, className = '' }: BrandIconProps) {
  return (
    <img
      src="/replyflow-r-logo.png?v=2"
      alt="ReplyFlow"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain' }}
    />
  )
}
