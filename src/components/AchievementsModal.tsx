"use client"

import React, { useMemo, useState } from 'react'
import Modal from '@/components/ui/Modal'
import { Trophy, Star, Target, Zap, CheckCircle2, Lock } from 'lucide-react'

export interface AchievementItem {
  id: string
  title: string
  description: string
  icon: 'trophy' | 'star' | 'target' | 'zap'
  category: string
  earned: boolean
  earnedAt?: string
  progressCurrent?: number
  progressTarget?: number
}

interface AchievementsModalProps {
  isOpen: boolean
  onClose: () => void
  achievements: AchievementItem[]
}

function IconFor({ icon }: { icon: AchievementItem['icon'] }) {
  if (icon === 'trophy') return <Trophy className="w-4 h-4" />
  if (icon === 'star') return <Star className="w-4 h-4" />
  if (icon === 'target') return <Target className="w-4 h-4" />
  if (icon === 'zap') return <Zap className="w-4 h-4" />
  return <Trophy className="w-4 h-4" />
}

export default function AchievementsModal({ isOpen, onClose, achievements }: AchievementsModalProps) {
  const [activeCategory, setActiveCategory] = useState<string>('all')

  const summary = useMemo(() => {
    const total = achievements.length
    const unlocked = achievements.filter(a => a.earned).length
    return { total, unlocked }
  }, [achievements])

  const categories = useMemo(() => {
    const set = new Set<string>()
    achievements.forEach(a => set.add(a.category))
    return ['all', ...Array.from(set)]
  }, [achievements])

  const list = useMemo(() => {
    if (activeCategory === 'all') return achievements
    return achievements.filter(a => a.category === activeCategory)
  }, [achievements, activeCategory])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="All Achievements"
      className="max-w-2xl"
      alignTopOnMobile
      mobileTopOffsetPx={20}
      mobileBottomOffsetPx={96}
      contentMaxHeight="calc(100dvh - (env(safe-area-inset-top) + 20px) - (env(safe-area-inset-bottom) + 96px) - 24px)"
    >
      <div className="px-5 py-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center">
              <Trophy className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Achievements</div>
              <div className="text-xs text-muted-foreground">{summary.unlocked} of {summary.total} unlocked</div>
            </div>
          </div>
        </div>
        {categories.length > 2 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors whitespace-nowrap ${
                  activeCategory === cat
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 text-foreground border-border/50 hover:bg-muted'
                }`}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-5 space-y-3">
        {list.map((a) => {
          const hasProgress = !a.earned && a.progressTarget && (a.progressCurrent ?? 0) > 0
          const pct = hasProgress ? Math.min(100, Math.round(((a.progressCurrent || 0) / (a.progressTarget || 1)) * 100)) : 0
          return (
            <div key={a.id} className={`flex items-start gap-3 border rounded-lg p-3 ${a.earned ? 'border-emerald-700/40 bg-emerald-900/10' : 'border-border/50 bg-muted/30'}`}>
              <div className={`w-8 h-8 rounded-md flex items-center justify-center ${a.earned ? 'bg-emerald-500/15' : 'bg-slate-500/10'}`}>
                <IconFor icon={a.icon} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-foreground truncate">{a.title}</div>
                  {a.earned ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Unlocked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <Lock className="w-3.5 h-3.5" /> Locked
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{a.description}</div>
                {a.earned && a.earnedAt && (
                  <div className="text-[11px] text-emerald-300 mt-1">Unlocked on {new Date(a.earnedAt).toLocaleDateString()}</div>
                )}
                {!a.earned && hasProgress && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                      <span>{a.progressCurrent} / {a.progressTarget}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-700 overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {list.length === 0 && (
          <div className="text-sm text-muted-foreground">No achievements in this category.</div>
        )}
      </div>
    </Modal>
  )
}
