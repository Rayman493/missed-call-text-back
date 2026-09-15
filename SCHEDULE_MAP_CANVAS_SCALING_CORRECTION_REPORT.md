# Schedule Map Canvas HiDPI Scaling - Correction Report

## 1. Current 36px Values at DPR=3

**BEFORE CORRECTION (WRONG):**
- logical size: 36px
- canvas.width: 108px (36 * 3)
- canvas.height: 108px (36 * 3)
- drawing coordinate system: scaled by 3 (ctx.scale(3, 3))
- icon.size: not set
- icon.scaledSize: 108px (36 * 3) ✗ WRONG
- icon.anchor: 54px (108 / 2) ✗ WRONG

**AFTER CORRECTION (CORRECT):**
- logical size: 36px
- canvas.width: 108px (36 * 3)
- canvas.height: 108px (36 * 3)
- drawing coordinate system: scaled by 3 (ctx.scale(3, 3))
- icon.size: not set
- icon.scaledSize: 36px ✓ CORRECT
- icon.anchor: 18px (36 / 2) ✓ CORRECT

**For 44px selected marker at DPR=3:**
- logical size: 44px
- canvas.width: 132px (44 * 3)
- canvas.height: 132px (44 * 3)
- drawing coordinate system: scaled by 3 (ctx.scale(3, 3))
- icon.scaledSize: 44px ✓ CORRECT
- icon.anchor: 22px (44 / 2) ✓ CORRECT

## 2. Whether Current scaledSize Was Wrong

**YES, the previous implementation was INCORRECT.**

Google Maps Icon.scaledSize represents the **DISPLAYED size** (logical pixels), not the backing-store dimensions.

Using `scaledSize = size * dpr` (e.g., 36 * 3 = 108) would cause Google Maps to display the marker at 108px instead of 36px, making it appear 3x larger than intended on a 3x device.

The correct pattern is:
- Canvas backing store: `size * dpr` (physical pixels for crispness)
- Google Maps scaledSize: `size` (logical displayed size)
- Google Maps anchor: `size / 2` (logical coordinates)

## 3. Correct Backing-Store Dimensions

**DPR 1 (standard display):**
- 36px marker: 36x36 backing store
- 44px marker: 44x44 backing store

**DPR 2 (Retina display):**
- 36px marker: 72x72 backing store
- 44px marker: 88x88 backing store

**DPR 3 (modern Android display):**
- 36px marker: 108x108 backing store
- 44px marker: 132x132 backing store

**Fallback:**
- If devicePixelRatio is undefined: fallback to DPR 1

## 4. Correct Rendered scaledSize

**ALL devices:**
- 36px marker: scaledSize = 36 (logical displayed size)
- 44px marker: scaledSize = 44 (logical displayed size)

The scaledSize should NOT vary by device pixel ratio. It represents the logical displayed size in CSS pixels.

## 5. Correct Anchor

**ALL devices:**
- 36px marker: anchor = (18, 18) (logical coordinates)
- 44px marker: anchor = (22, 22) (logical coordinates)

The anchor should be in logical displayed coordinates, not backing-store coordinates.

## 6. Cache Behavior

**Cache key format:**
```
${stopNumber}-${type}-${isSelected}-${dpr}
```

**Examples:**
- DPR 1: `1-appointment-false-1`
- DPR 2: `1-appointment-false-2`
- DPR 3: `1-appointment-false-3`

**Purpose:** Prevents wrong-scale cache hits when device pixel ratio changes (e.g., moving between displays, browser window moving between monitors).

## 7. Tests/Build

**Tests:**
- ✓ All 8 canvas scaling tests pass
- ✓ All 477 schedule tests pass (469 original + 8 new)

**Build:**
- ✓ Production build successful
- ✓ TypeScript validation passed

**Commit:** `4cb4fb06` - "correct Schedule Map canvas HiDPI scaling to use proper Google Maps Icon semantics"
**Push:** `origin main`

## 8. Commit SHA

**SHA:** `4cb4fb06`
**Message:** "correct Schedule Map canvas HiDPI scaling to use proper Google Maps Icon semantics"
**Push:** `origin main` (f758b46e..4cb4fb06)

---

## Summary

**Root cause of incorrect implementation:**
- Previous implementation incorrectly used backing-store dimensions for Google Maps scaledSize
- scaledSize represents DISPLAYED size, not backing-store dimensions
- This would have caused markers to appear giant on high-DPI displays

**Correction:**
- Canvas backing store: `size * dpr` (physical pixels for crisp rendering)
- Google Maps scaledSize: `size` (logical displayed size)
- Google Maps anchor: `size / 2` (logical coordinates)
- Fallback DPR changed from 2 to 1 (standard default)

**Expected improvement:**
- Crisper marker rendering on high-DPI displays
- Correct marker size on all devices (no giant markers)
- Proper image resampling

**Physical size regression:**
- 36px markers display at 36px on all devices ✓
- 44px markers display at 44px on all devices ✓
- No size change compared to original implementation ✓

**Performance claim:**
- Correct DPR primarily improves sharpness and image resampling correctness
- Gesture improvement requires physical profiling to prove
- Do NOT claim manual smoothness fixed until physical testing proves it

**Autofocus/Stop Colors:**
- No changes to autofocus logic, selected-day framing, map type lifecycle, marker persistence, or stop colors.