'use client'

import SelectPicker from '@/components/ui/SelectPicker'
import DatePicker from '@/components/ui/DatePicker'

export type RepeatFrequency = 'none' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'
export type RepeatEndType = 'never' | 'on_date' | 'after_occurrences'

export interface RepeatValue {
  frequency: RepeatFrequency
  endType: RepeatEndType
  endDate: string
  maxOccurrences: string
}

export const NO_REPEAT: RepeatValue = {
  frequency: 'none',
  endType: 'never',
  endDate: '',
  maxOccurrences: '',
}

const FREQUENCY_OPTIONS = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

const END_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: 'on_date', label: 'On date' },
  { value: 'after_occurrences', label: 'After' },
]

interface RepeatControlsProps {
  value: RepeatValue
  onChange: (value: RepeatValue) => void
  /** When set, recurrence can't be persisted yet (e.g. no date chosen) — the
      picker is replaced by a non-operable prerequisite hint instead of hiding. */
  prerequisiteHint?: string
}

/** Serialize to the API recurrence payload, or null when it does not repeat. */
export function repeatPayload(value: RepeatValue) {
  if (value.frequency === 'none') return null
  return {
    frequency: value.frequency,
    end_type: value.endType,
    end_date: value.endType === 'on_date' ? value.endDate || null : null,
    max_occurrences:
      value.endType === 'after_occurrences' ? parseInt(value.maxOccurrences, 10) || null : null,
  }
}

/** Concise label like "Repeats weekly" for badges and summaries. */
export function repeatLabel(recurrence: { frequency?: string; interval?: number } | null | undefined): string | null {
  if (!recurrence?.frequency) return null
  switch (recurrence.frequency) {
    case 'daily': return 'Daily'
    case 'weekdays': return 'Weekdays'
    case 'weekly': return 'Weekly'
    case 'biweekly': return 'Every 2 weeks'
    case 'monthly': return 'Monthly'
    case 'yearly': return 'Yearly'
    default: return 'Repeats'
  }
}

export default function RepeatControls({ value, onChange, prerequisiteHint }: RepeatControlsProps) {
  const repeats = value.frequency !== 'none'

  if (prerequisiteHint) {
    return (
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
          Repeat
        </label>
        <p className="text-xs text-muted-foreground/80 px-3 py-2.5 bg-muted/20 dark:bg-slate-900/40 border border-dashed border-border/50 dark:border-slate-700/60 rounded-lg">
          {prerequisiteHint}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <SelectPicker
        value={value.frequency}
        onChange={(v) => onChange({ ...value, frequency: (v || 'none') as RepeatFrequency })}
        options={FREQUENCY_OPTIONS}
        label="Repeat"
        placeholder="Does not repeat"
      />

      {repeats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectPicker
            value={value.endType}
            onChange={(v) => onChange({ ...value, endType: (v || 'never') as RepeatEndType })}
            options={END_OPTIONS}
            label="Ends"
            placeholder="Never"
          />
          {value.endType === 'on_date' && (
            <DatePicker
              value={value.endDate}
              onChange={(v) => onChange({ ...value, endDate: v })}
              label="End date"
              placeholder="Select date"
            />
          )}
          {value.endType === 'after_occurrences' && (
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                Occurrences
              </label>
              <input
                type="number"
                min={2}
                max={500}
                value={value.maxOccurrences}
                onChange={(e) => onChange({ ...value, maxOccurrences: e.target.value })}
                placeholder="e.g. 10"
                className="w-full px-3 py-2.5 bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
