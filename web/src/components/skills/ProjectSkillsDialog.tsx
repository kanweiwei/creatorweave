/**
 * ProjectSkillsDialog - Dialog shown when project skills are discovered.
 *
 * Displays scanned skills from the project directory with checkboxes
 * for user to select which ones to load.
 */

import { useState, useCallback } from 'react'
import { Check, FolderOpen } from 'lucide-react'
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { SkillMetadata } from '@/skills/skill-types'

interface ProjectSkillsDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Skills discovered in the project */
  skills: SkillMetadata[]
  /** Callback when user confirms selection */
  onConfirm: (selectedIds: string[]) => void
  /** Callback when user skips loading */
  onSkip: () => void
}

export function ProjectSkillsDialog({ open, skills, onConfirm, onSkip }: ProjectSkillsDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Reset selection when dialog opens with new skills
  const isOpen = useCallback(
    (isOpen: boolean) => {
      if (isOpen && skills.length > 0) {
        setSelectedIds(new Set(skills.map((s) => s.id)))
      }
    },
    [skills]
  )

  const toggleSkill = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (selectedIds.size === skills.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(skills.map((s) => s.id)))
    }
  }, [selectedIds.size, skills])

  const handleConfirm = useCallback(() => {
    onConfirm(Array.from(selectedIds))
    setSelectedIds(new Set())
  }, [selectedIds, onConfirm])

  const handleSkip = useCallback(() => {
    onSkip()
    setSelectedIds(new Set())
  }, [onSkip])

  if (skills.length === 0) return null

  return (
    <DialogContent open={open} onOpenChange={isOpen}>
      <DialogHeader>
        <DialogTitle>🔍 发现项目技能</DialogTitle>
        <DialogDescription>在项目中发现了 {skills.length} 个技能，是否加载？</DialogDescription>
      </DialogHeader>

      <div className="max-h-96 space-y-3 overflow-y-auto">
        {/* Select All */}
        <button
          type="button"
          onClick={toggleAll}
          className="text-sm text-primary-600 transition-colors hover:text-primary-700"
        >
          {selectedIds.size === skills.length ? '取消全选' : '全选'}
        </button>

        {/* Skill List */}
        <div className="space-y-2">
          {skills.map((skill) => (
            <SkillListItem
              key={skill.id}
              skill={skill}
              selected={selectedIds.has(skill.id)}
              onToggle={() => toggleSkill(skill.id)}
            />
          ))}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={handleSkip}>
          跳过
        </Button>
        <Button onClick={handleConfirm} disabled={selectedIds.size === 0}>
          加载选中 ({selectedIds.size})
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

interface SkillListItemProps {
  skill: SkillMetadata
  selected: boolean
  onToggle: () => void
}

function SkillListItem({ skill, selected, onToggle }: SkillListItemProps) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
        selected
          ? 'border-primary-200 bg-primary-50'
          : 'border-neutral-200 bg-white hover:bg-neutral-50'
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="mt-1 h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
      />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-neutral-900">{skill.name}</div>
        <div className="line-clamp-2 text-sm text-neutral-500">{skill.description}</div>
        <div className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
          <FolderOpen className="h-3 w-3" />
          <span className="truncate">
            {skill.source === 'project' ? '.claude/skills/' : 'skills/'}
          </span>
        </div>
      </div>
      {selected && (
        <div className="flex-shrink-0">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-600">
            <Check className="h-3 w-3 text-white" />
          </div>
        </div>
      )}
    </label>
  )
}
