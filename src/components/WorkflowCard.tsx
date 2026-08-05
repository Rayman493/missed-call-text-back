'use client'

import React, { useState, useEffect } from 'react'
import { CheckCircle, Circle, ChevronRight, ArrowRight } from 'lucide-react'
import { workflowService } from '@/lib/smart-workflow/smart-workflow-service'
import type { Workflow, WorkflowStep } from '@/lib/smart-workflow/smart-workflow-types'
import { useRouter } from 'next/navigation'

interface WorkflowCardProps {
  businessId: string
  customerId: string
}

export default function WorkflowCard({ businessId, customerId }: WorkflowCardProps) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    setLoading(true)
    workflowService.getWorkflow({ businessId, customerId })
      .then(setWorkflow)
      .catch(err => {
        console.error('[WorkflowCard] Failed to fetch workflow:', err)
      })
      .finally(() => setLoading(false))
  }, [businessId, customerId])

  if (loading || !workflow) {
    return null
  }

  const handleStepAction = (step: WorkflowStep) => {
    if (step.action?.route) {
      router.push(step.action.route)
    }
  }

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200/70 dark:border-indigo-800/50 rounded-xl p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">
          Customer Journey
        </h3>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-600 dark:bg-indigo-400 rounded-full transition-all duration-300"
              style={{ width: `${workflow.progress}%` }}
            />
          </div>
          <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
            {workflow.completedSteps}/{workflow.totalSteps}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {workflow.steps.map((step, index) => (
          <WorkflowStepItem
            key={step.id}
            step={step}
            index={index}
            onAction={() => handleStepAction(step)}
          />
        ))}
      </div>
    </div>
  )
}

interface WorkflowStepItemProps {
  step: WorkflowStep
  index: number
  onAction: () => void
}

function WorkflowStepItem({ step, index, onAction }: WorkflowStepItemProps) {
  const isCompleted = step.status === 'completed'
  const isCurrent = step.status === 'current'
  const isSkipped = step.status === 'skipped'

  return (
    <div 
      className={`flex items-start gap-2 ${isSkipped ? 'opacity-40' : ''}`}
      onClick={step.action && isCurrent ? onAction : undefined}
    >
      <div className="flex-shrink-0 mt-0.5">
        {isCompleted ? (
          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        ) : isCurrent ? (
          <Circle className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        ) : isSkipped ? (
          <Circle className="w-4 h-4 text-slate-400 dark:text-slate-600" />
        ) : (
          <Circle className="w-4 h-4 text-slate-400 dark:text-slate-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${
            isCompleted 
              ? 'text-slate-900 dark:text-foreground line-through' 
              : isCurrent 
                ? 'text-slate-900 dark:text-foreground font-semibold' 
                : 'text-slate-600 dark:text-slate-400'
          }`}>
            {step.title}
          </span>
          {isCurrent && step.action && (
            <ChevronRight className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
          )}
        </div>
        {isCurrent && step.description && (
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            {step.description}
          </p>
        )}
      </div>
    </div>
  )
}
