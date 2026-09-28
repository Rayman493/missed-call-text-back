/**
 * Autoplay primitives for the interactive demo walkthrough.
 *
 * Extracted so the timer contract is unit-testable without a DOM renderer:
 * exactly one pending timeout at a time, cancel-before-schedule, deterministic
 * cleanup, and clamped step transitions that can never go out of range.
 */

export function clampStepIndex(step: number, stepCount: number): number {
  if (!Number.isFinite(step)) return 0
  return Math.max(0, Math.min(Math.trunc(step), stepCount - 1))
}

export function nextStepIndex(step: number, stepCount: number): number {
  return clampStepIndex(step + 1, stepCount)
}

export function prevStepIndex(step: number, stepCount: number): number {
  return clampStepIndex(step - 1, stepCount)
}

export interface AutoplayScheduler {
  /** Schedule the next tick. Any pending timer is cancelled first — two are never live at once. */
  schedule(): void
  /** Cancel the pending timer, if any. Safe to call repeatedly. */
  cancel(): void
  /** True while a timeout is pending. */
  readonly pending: boolean
}

export function createAutoplayScheduler(opts: {
  getDelayMs: () => number
  onTick: () => void
}): AutoplayScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    schedule() {
      cancel()
      timer = setTimeout(() => {
        timer = null
        opts.onTick()
      }, opts.getDelayMs())
    },
    cancel,
    get pending() {
      return timer !== null
    },
  }
}
