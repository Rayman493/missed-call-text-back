/**
 * Validate geographic coordinates to prevent invalid markers on the map.
 *
 * @param lat - Latitude value
 * @param lng - Longitude value
 * @returns true if coordinates are valid, false otherwise
 */
export function isValidCoordinate(lat: number | null | undefined, lng: number | null | undefined): boolean {
  // Check for null/undefined
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return false
  }
  
  // Check for NaN
  if (isNaN(lat) || isNaN(lng)) {
    return false
  }
  
  // Check for 0,0 placeholder (Null Island)
  if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) {
    return false
  }
  
  // Check for valid latitude range (-90 to 90)
  if (lat < -90 || lat > 90) {
    return false
  }
  
  // Check for valid longitude range (-180 to 180)
  if (lng < -180 || lng > 180) {
    return false
  }
  
  return true
}

/**
 * Calculate responsive padding for map fitBounds to account for UI elements.
 *
 * @param isMobile - Whether the viewport is mobile-sized
 * @param bottomNavHeight - Height of the bottom navigation bar in pixels
 * @returns Padding object with top, right, bottom, left values
 */
export function getResponsiveMapPadding(isMobile: boolean, bottomNavHeight: number = 80): { top: number; right: number; bottom: number; left: number } {
  if (isMobile) {
    // Mobile: account for top header, Today's Schedule panel, bottom nav, map controls
    return {
      top: 180, // Today's Schedule panel + header
      right: 20, // Right edge cushion for map controls
      bottom: bottomNavHeight + 40, // Bottom nav + breathing room
      left: 20 // Left edge cushion
    }
  } else {
    // Desktop: more breathing room, less UI obstruction
    return {
      top: 60, // Header
      right: 40, // Right cushion
      bottom: 40, // Bottom cushion
      left: 40 // Left cushion
    }
  }
}