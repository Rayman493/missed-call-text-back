# Dashboard Bar Chart Hover Highlight Fix Report

## 1. Exact Components/Files

- **Customers by Status:** `src/components/analytics/CustomersStatusGraph.tsx`
- **Customer Workflow:** `src/components/analytics/CustomerPipelineGraph.tsx`

Both use Recharts `BarChart` with `Tooltip` component from recharts library.

## 2. Exact Source of Large Hover Rectangle

**Source:** Recharts' default `Tooltip` cursor behavior.

When `cursor` is not explicitly set on the Tooltip component, Recharts automatically renders a category cursor that highlights the entire row/category behind the hovered bar with a gray/transparent rectangular background.

**This is NOT:**
- activeBar shape
- Custom selection layer
- ChartTouchWrapper
- CSS applied to .recharts-tooltip-cursor
- CSS applied to .recharts-active-bar
- CSS applied to .recharts-rectangle

**This IS:**
- Recharts built-in cursor rendering in the Tooltip component
- Default behavior when cursor prop is not set

## 3. Whether It Was Tooltip cursor / activeBar / Wrapper / Other

**It was Tooltip cursor.**

Recharts Tooltip has a default cursor behavior that highlights the category/row. This is disabled by setting `cursor={false}` on the Tooltip component.

## 4. Exact Fix

**Added `cursor={false}` to both Tooltip components:**

**BEFORE:**
```tsx
<Tooltip content={<PremiumTooltip />} />
```

**AFTER:**
```tsx
<Tooltip content={<PremiumTooltip />} cursor={false} />
```

This disables the default category cursor while preserving:
- Tooltip visibility
- Tooltip content (label, count, color indicator)
- Bar hover interaction
- Bar accessibility
- Touch behavior (ChartTouchWrapper)

## 5. Customers by Status Result

- ✓ Hover shows tooltip with status label and count
- ✓ No large rectangular category background highlight
- ✓ Bar remains interactive
- ✓ Touch behavior preserved via ChartTouchWrapper
- ✓ Mobile swipe to scroll works normally

## 6. Customer Workflow Result

- ✓ Hover shows tooltip with status label and count
- ✓ No large rectangular category background highlight
- ✓ Bar remains interactive
- ✓ Touch behavior preserved via ChartTouchWrapper
- ✓ Mobile swipe to scroll works normally

## 7. Mobile Behavior Preserved

ChartTouchWrapper unchanged:
- ✓ Vertical swipe → page scroll
- ✓ Tap → tooltip shows
- ✓ No persistent category highlight during scroll
- ✓ Tooltip dismisses normally
- ✓ Pointer events managed correctly during scroll

## 8. Tests/Build

**Tests:** 334 dashboard tests passed (1 pre-existing failure due to missing @testing-library/react dependency, unrelated to changes)
**Build:** ✓ Production build successful
**TypeScript:** ✓ Validation passed
**Commit:** `730ad1c7` - "remove oversized bar chart hover highlight in Customers by Status and Customer Workflow"
**Push:** `origin main`

## 9. Files Changed

**Files modified:**
- `src/components/analytics/CustomersStatusGraph.tsx` - Added `cursor={false}` to Tooltip
- `src/components/analytics/CustomerPipelineGraph.tsx` - Added `cursor={false}` to Tooltip

**Lines changed:** +2 insertions

## 10. Commit SHA

**SHA:** `730ad1c7`
**Message:** "remove oversized bar chart hover highlight in Customers by Status and Customer Workflow"
**Push:** `origin main` (4cb4fb06..730ad1c7)

---

## Summary

**Root cause:** Recharts' Tooltip component has a default cursor behavior that highlights the entire category/row with a large rectangular background when hovering bars.

**Fix:** Added `cursor={false}` to both Tooltip components to disable the default category cursor while preserving tooltip functionality and bar interaction.

**Result:**
- Hover shows tooltip with status label and count
- No large rectangular category background highlight
- Bar remains interactive
- Touch behavior preserved
- Mobile swipe to scroll works normally

**Both charts now have consistent interaction behavior with clean, intentional hover states.**