export function bookingPagePath(slug: string): string {
  return `/book/${slug}`
}

export function bookingPageUrl(slug: string, origin: string): string {
  const base = origin.replace(/\/$/, '')
  return `${base}${bookingPagePath(slug)}`
}
