import { describe, it, expect } from 'vitest'
import { isValidCoordinate, getResponsiveMapPadding } from './map-utils'

describe('isValidCoordinate', () => {
  it('should reject null coordinates', () => {
    expect(isValidCoordinate(null, null)).toBe(false)
    expect(isValidCoordinate(null, 0)).toBe(false)
    expect(isValidCoordinate(0, null)).toBe(false)
  })

  it('should reject undefined coordinates', () => {
    expect(isValidCoordinate(undefined, undefined)).toBe(false)
    expect(isValidCoordinate(undefined, 0)).toBe(false)
    expect(isValidCoordinate(0, undefined)).toBe(false)
  })

  it('should reject NaN coordinates', () => {
    expect(isValidCoordinate(NaN, 0)).toBe(false)
    expect(isValidCoordinate(0, NaN)).toBe(false)
    expect(isValidCoordinate(NaN, NaN)).toBe(false)
  })

  it('should reject 0,0 placeholder (Null Island)', () => {
    expect(isValidCoordinate(0, 0)).toBe(false)
    expect(isValidCoordinate(0.0001, 0)).toBe(false)
    expect(isValidCoordinate(0, 0.0001)).toBe(false)
  })

  it('should reject coordinates near 0,0', () => {
    expect(isValidCoordinate(0.0005, 0.0005)).toBe(false)
  })

  it('should accept coordinates far from 0,0', () => {
    expect(isValidCoordinate(0.001, 0.001)).toBe(true)
  })

  it('should reject invalid latitude (> 90)', () => {
    expect(isValidCoordinate(91, 0)).toBe(false)
    expect(isValidCoordinate(100, 0)).toBe(false)
  })

  it('should reject invalid latitude (< -90)', () => {
    expect(isValidCoordinate(-91, 0)).toBe(false)
    expect(isValidCoordinate(-100, 0)).toBe(false)
  })

  it('should reject invalid longitude (> 180)', () => {
    expect(isValidCoordinate(0, 181)).toBe(false)
    expect(isValidCoordinate(0, 200)).toBe(false)
  })

  it('should reject invalid longitude (< -180)', () => {
    expect(isValidCoordinate(0, -181)).toBe(false)
    expect(isValidCoordinate(0, -200)).toBe(false)
  })

  it('should accept valid coordinates', () => {
    expect(isValidCoordinate(40.7128, -74.0060)).toBe(true) // New York
    expect(isValidCoordinate(37.7749, -122.4194)).toBe(true) // San Francisco
    expect(isValidCoordinate(51.5074, -0.1278)).toBe(true) // London
    expect(isValidCoordinate(40.4406, -79.9959)).toBe(true) // Pittsburgh
  })

  it('should accept boundary values', () => {
    expect(isValidCoordinate(90, 0)).toBe(true)
    expect(isValidCoordinate(-90, 0)).toBe(true)
    expect(isValidCoordinate(0, 180)).toBe(true)
    expect(isValidCoordinate(0, -180)).toBe(true)
  })
})

describe('getResponsiveMapPadding', () => {
  it('should return mobile padding with custom bottom nav height', () => {
    const padding = getResponsiveMapPadding(true, 100)
    expect(padding.top).toBe(180)
    expect(padding.right).toBe(20)
    expect(padding.bottom).toBe(140) // 100 + 40
    expect(padding.left).toBe(20)
  })

  it('should return mobile padding with default bottom nav height', () => {
    const padding = getResponsiveMapPadding(true)
    expect(padding.top).toBe(180)
    expect(padding.right).toBe(20)
    expect(padding.bottom).toBe(120) // 80 + 40
    expect(padding.left).toBe(20)
  })

  it('should return desktop padding', () => {
    const padding = getResponsiveMapPadding(false)
    expect(padding.top).toBe(60)
    expect(padding.right).toBe(40)
    expect(padding.bottom).toBe(40)
    expect(padding.left).toBe(40)
  })

  it('should accept custom bottom nav height for desktop', () => {
    const padding = getResponsiveMapPadding(false, 100)
    expect(padding.bottom).toBe(40) // Desktop doesn't use bottomNavHeight
  })
})