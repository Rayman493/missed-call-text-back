/// <reference types="vitest" />
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = path.resolve(__dirname, '..', '..')

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

// ============================================================================
// VOICEMAIL SEEK SURFACE OWNERSHIP TESTS
// ============================================================================

describe('Voicemail Seek Surface Ownership', () => {
  const player = readSrc('components/PremiumAudioPlayer.tsx')

  // -------------------------------------------------------------------------
  // 1. Waveform is NON-interactive
  // -------------------------------------------------------------------------
  describe('1. Waveform is non-interactive', () => {
    it('waveform container has pointer-events-none', () => {
      const waveformIdx = player.indexOf('Decorative Waveform')
      const block = player.substring(waveformIdx, waveformIdx + 400)
      expect(block).toContain('pointer-events-none')
    })

    it('waveform container has select-none', () => {
      const waveformIdx = player.indexOf('Decorative Waveform')
      const block = player.substring(waveformIdx, waveformIdx + 400)
      expect(block).toContain('select-none')
    })

    it('waveform has NO onClick handler', () => {
      const waveformIdx = player.indexOf('Decorative Waveform')
      const waveformEnd = player.indexOf('Canonical Seek Surface')
      const block = player.substring(waveformIdx, waveformEnd)
      expect(block).not.toContain('onClick')
    })

    it('waveform has NO onPointerDown handler', () => {
      const waveformIdx = player.indexOf('Decorative Waveform')
      const waveformEnd = player.indexOf('Canonical Seek Surface')
      const block = player.substring(waveformIdx, waveformEnd)
      expect(block).not.toContain('onPointerDown')
    })

    it('waveform has NO onPointerMove handler', () => {
      const waveformIdx = player.indexOf('Decorative Waveform')
      const waveformEnd = player.indexOf('Canonical Seek Surface')
      const block = player.substring(waveformIdx, waveformEnd)
      expect(block).not.toContain('onPointerMove')
    })

    it('waveform has NO invisible overlay with z-10', () => {
      const waveformIdx = player.indexOf('Decorative Waveform')
      const waveformEnd = player.indexOf('Canonical Seek Surface')
      const block = player.substring(waveformIdx, waveformEnd)
      expect(block).not.toContain('z-10')
      expect(block).not.toContain('absolute inset-0')
    })

    it('waveform pointer interaction does NOT change currentTime', () => {
      const waveformIdx = player.indexOf('Decorative Waveform')
      const waveformEnd = player.indexOf('Canonical Seek Surface')
      const block = player.substring(waveformIdx, waveformEnd)
      expect(block).not.toContain('seekToClientX')
      expect(block).not.toContain('handleProgressClick')
      expect(block).not.toContain('handleProgressDragStart')
    })
  })

  // -------------------------------------------------------------------------
  // 2. Progress line IS the canonical seek surface
  // -------------------------------------------------------------------------
  describe('2. Progress line is the seek surface', () => {
    it('progress line container has progressBarRef attached', () => {
      const seekIdx = player.indexOf('Canonical Seek Surface')
      const block = player.substring(seekIdx, seekIdx + 1200)
      expect(block).toContain('ref={progressBarRef}')
    })

    it('progress line has onClick handler', () => {
      const seekIdx = player.indexOf('Canonical Seek Surface')
      const block = player.substring(seekIdx, seekIdx + 1200)
      expect(block).toContain('onClick={handleProgressClick}')
    })

    it('progress line has onPointerDown handler', () => {
      const seekIdx = player.indexOf('Canonical Seek Surface')
      const block = player.substring(seekIdx, seekIdx + 1200)
      expect(block).toContain('onPointerDown={handleProgressDragStart}')
    })

    it('progress line has onPointerMove handler', () => {
      const seekIdx = player.indexOf('Canonical Seek Surface')
      const block = player.substring(seekIdx, seekIdx + 1200)
      expect(block).toContain('onPointerMove={handleProgressDragMove}')
    })

    it('progress line has onPointerUp handler', () => {
      const seekIdx = player.indexOf('Canonical Seek Surface')
      const block = player.substring(seekIdx, seekIdx + 1200)
      expect(block).toContain('onPointerUp={handleProgressDragEnd}')
    })

    it('progress line has onPointerCancel handler', () => {
      const seekIdx = player.indexOf('Canonical Seek Surface')
      const block = player.substring(seekIdx, seekIdx + 1200)
      expect(block).toContain('onPointerCancel={handleProgressDragEnd}')
    })

    it('progress line has keyboard navigation (onKeyDown)', () => {
      const seekIdx = player.indexOf('Canonical Seek Surface')
      const block = player.substring(seekIdx, seekIdx + 1200)
      expect(block).toContain('onKeyDown={handleKeyDown}')
    })

    it('progress line has slider role and aria attributes', () => {
      const seekIdx = player.indexOf('Canonical Seek Surface')
      const block = player.substring(seekIdx, seekIdx + 1200)
      expect(block).toContain('role="slider"')
      expect(block).toContain('aria-label="Audio progress"')
      expect(block).toContain('aria-valuemin')
      expect(block).toContain('aria-valuemax')
      expect(block).toContain('aria-valuenow')
    })
  })

  // -------------------------------------------------------------------------
  // 3. Pointer capture works
  // -------------------------------------------------------------------------
  describe('3. Pointer capture + release', () => {
    it('handleProgressDragStart calls setPointerCapture', () => {
      const idx = player.indexOf('handleProgressDragStart')
      const block = player.substring(idx, idx + 800)
      expect(block).toContain('setPointerCapture(e.pointerId)')
    })

    it('handleProgressDragEnd calls releasePointerCapture', () => {
      const idx = player.indexOf('handleProgressDragEnd')
      const block = player.substring(idx, idx + 800)
      expect(block).toContain('releasePointerCapture(e.pointerId)')
    })

    it('pointer capture is wrapped in try/catch (Android safety)', () => {
      const idx = player.indexOf('handleProgressDragStart')
      const block = player.substring(idx, idx + 800)
      expect(block).toContain('try')
      expect(block).toContain('catch')
    })

    it('pointer release is wrapped in try/catch (Android safety)', () => {
      const idx = player.indexOf('handleProgressDragEnd')
      const block = player.substring(idx, idx + 800)
      expect(block).toContain('try')
      expect(block).toContain('catch')
    })

    it('isDragging state is set on pointerdown', () => {
      const idx = player.indexOf('handleProgressDragStart')
      const block = player.substring(idx, idx + 800)
      expect(block).toContain('setIsDragging(true)')
    })

    it('isDragging state is cleared on pointerup', () => {
      const idx = player.indexOf('handleProgressDragEnd')
      const block = player.substring(idx, idx + 800)
      expect(block).toContain('setIsDragging(false)')
    })

    it('handleProgressDragMove only seeks when isDragging is true', () => {
      const idx = player.indexOf('handleProgressDragMove')
      const block = player.substring(idx, idx + 400)
      expect(block).toContain('!isDragging')
    })
  })

  // -------------------------------------------------------------------------
  // 4. Android hit area
  // -------------------------------------------------------------------------
  describe('4. Android hit area', () => {
    it('seek surface has enlarged hit area (h-8 = 32px)', () => {
      const seekIdx = player.indexOf('Canonical Seek Surface')
      const block = player.substring(seekIdx, seekIdx + 1200)
      expect(block).toContain('h-8')
    })

    it('seek surface has near-transparent background for Android hit-test', () => {
      const seekIdx = player.indexOf('Canonical Seek Surface')
      const block = player.substring(seekIdx, seekIdx + 1200)
      expect(block).toContain('bg-black/[0.001]')
    })

    it('seek surface has touch-action: none (prevents scroll consumption)', () => {
      const seekIdx = player.indexOf('Canonical Seek Surface')
      const block = player.substring(seekIdx, seekIdx + 1200)
      expect(block).toContain("touchAction: 'none'")
    })

    it('visible progress line is thin (h-1) and centered in hit area', () => {
      const seekIdx = player.indexOf('Canonical Seek Surface')
      const block = player.substring(seekIdx, seekIdx + 1200)
      expect(block).toContain('h-1')
      expect(block).toContain('flex items-center')
    })

    it('visible progress fill uses width percentage', () => {
      const seekIdx = player.indexOf('Canonical Seek Surface')
      const block = player.substring(seekIdx, seekIdx + 2000)
      expect(block).toContain('progressPercent')
    })
  })

  // -------------------------------------------------------------------------
  // 5. Canonical duration source
  // -------------------------------------------------------------------------
  describe('5. Canonical duration source', () => {
    it('seekToClientX prefers audio.duration over prop', () => {
      const idx = player.indexOf('seekToClientX')
      const block = player.substring(idx, idx + 2000)
      expect(block).toContain('audio.duration')
      expect(block).toContain('Number.isFinite(audioDuration)')
      expect(block).toContain('audioDuration > 0')
    })

    it('seekToClientX falls back to prop duration when audio.duration invalid', () => {
      const idx = player.indexOf('seekToClientX')
      const block = player.substring(idx, idx + 2000)
      // The ternary: ? audioDuration : duration
      expect(block).toContain('? audioDuration')
      expect(block).toContain(': duration')
    })

    it('seekToClientX aborts when both durations are invalid', () => {
      const idx = player.indexOf('seekToClientX')
      const block = player.substring(idx, idx + 2000)
      expect(block).toContain('canonicalDuration <= 0')
    })

    it('seekToClientX clamps percent to 0..1', () => {
      const idx = player.indexOf('seekToClientX')
      const block = player.substring(idx, idx + 2000)
      expect(block).toContain('Math.min(1, Math.max(0')
    })

    it('seekToClientX sets both audio.currentTime AND calls onSeek', () => {
      const idx = player.indexOf('seekToClientX')
      const block = player.substring(idx, idx + 2000)
      expect(block).toContain('audio.currentTime = nextTime')
      expect(block).toContain('onSeek(nextTime)')
    })

    it('duration prop = 0 does not block seek when audio.duration is valid', () => {
      const idx = player.indexOf('seekToClientX')
      const block = player.substring(idx, idx + 2000)
      expect(block).toContain('Number.isFinite(audioDuration) && audioDuration > 0')
    })
  })

  // -------------------------------------------------------------------------
  // 6. No document-level mouse handlers (removed in favor of pointer capture)
  // -------------------------------------------------------------------------
  describe('6. No redundant document-level handlers', () => {
    it('does NOT add document mousemove listener', () => {
      expect(player).not.toContain("document.addEventListener('mousemove'")
    })

    it('does NOT add document mouseup listener', () => {
      expect(player).not.toContain("document.addEventListener('mouseup'")
    })
  })

  // -------------------------------------------------------------------------
  // 7. VoicemailMessage seekTo uses canonical duration
  // -------------------------------------------------------------------------
  describe('7. VoicemailMessage seekTo canonical duration', () => {
    const voicemail = readSrc('components/VoicemailMessage.tsx')

    it('seekTo prefers audio.duration over shared context duration', () => {
      const idx = voicemail.indexOf('const seekTo =')
      const block = voicemail.substring(idx, idx + 1000)
      expect(block).toContain('audio.duration')
      expect(block).toContain('Number.isFinite(audioDuration)')
      expect(block).toContain('audioDuration > 0')
    })

    it('seekTo clamps time using canonical duration', () => {
      const idx = voicemail.indexOf('const seekTo =')
      const block = voicemail.substring(idx, idx + 1000)
      expect(block).toContain('Math.max(0, Math.min(time, canonicalDuration))')
    })

    it('seekTo sets both audio.currentTime and shared context', () => {
      const idx = voicemail.indexOf('const seekTo =')
      const block = voicemail.substring(idx, idx + 1000)
      expect(block).toContain('audio.currentTime = clampedTime')
      expect(block).toContain('setCurrentTime(recording.id, clampedTime)')
    })
  })

  // -------------------------------------------------------------------------
  // 8. Progress visualization reflects playback position
  // -------------------------------------------------------------------------
  describe('8. Progress visualization', () => {
    it('progressPercent is calculated from currentTime / duration', () => {
      expect(player).toContain('progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0')
    })

    it('visible progress fill uses progressPercent for width', () => {
      const seekIdx = player.indexOf('Canonical Seek Surface')
      const block = player.substring(seekIdx, seekIdx + 2000)
      expect(block).toContain('width: `${progressPercent}%`')
    })

    it('waveform bars use progressPercent for played state', () => {
      const waveformIdx = player.indexOf('Decorative Waveform')
      const block = player.substring(waveformIdx, waveformIdx + 800)
      expect(block).toContain('progressPercent')
    })
  })
})
