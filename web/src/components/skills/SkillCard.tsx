/**
 * SkillCard - Display a single skill with toggle and actions.
 */

import { Eye, Pencil, Trash2, Tag } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { SkillMetadata } from '@/skills/skill-types'

interface SkillCardProps {
  skill: SkillMetadata
  /** Read-only mode for project skills (source files) */
  isReadOnly?: boolean
  onToggle: (id: string, enabled: boolean) => void
  onEdit: (skill: SkillMetadata) => void
  onDelete?: (id: string) => void
}

const CATEGORY_COLORS: Record<string, string> = {
  'code-review': 'bg-purple-100 text-purple-700',
  testing: 'bg-green-100 text-green-700',
  debugging: 'bg-red-100 text-red-700',
  refactoring: 'bg-orange-100 text-orange-700',
  documentation: 'bg-blue-100 text-blue-700',
  security: 'bg-yellow-100 text-yellow-700',
  performance: 'bg-pink-100 text-pink-700',
  architecture: 'bg-indigo-100 text-indigo-700',
  general: 'bg-gray-100 text-gray-700',
}

export function SkillCard({ skill, isReadOnly, onToggle, onEdit, onDelete }: SkillCardProps) {
  const handleToggle = (enabled: boolean) => {
    onToggle(skill.id, enabled)
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-4 transition-colors',
        skill.enabled ? 'border-neutral-200' : 'border-neutral-100 opacity-60'
      )}
    >
      {/* Header: Name + Toggle */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              'truncate font-medium text-neutral-900',
              !skill.enabled && 'text-neutral-400'
            )}
          >
            {skill.name}
          </h3>
          <p
            className={cn(
              'mt-1 line-clamp-2 text-sm text-neutral-500',
              !skill.enabled && 'text-neutral-300'
            )}
          >
            {skill.description}
          </p>
        </div>
        <Switch checked={skill.enabled} onCheckedChange={handleToggle} />
      </div>

      {/* Badges: Category + Tags */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="default" className={CATEGORY_COLORS[skill.category]}>
          {skill.category}
        </Badge>
        {skill.tags.slice(0, 3).map((tag) => (
          <Badge key={tag} variant="neutral" className="gap-1 text-xs">
            <Tag className="h-3 w-3" />
            {tag}
          </Badge>
        ))}
        {skill.tags.length > 3 && (
          <span className="text-xs text-neutral-400">+{skill.tags.length - 3}</span>
        )}
      </div>

      {/* Footer: Actions */}
      <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
        <div className="text-xs text-neutral-400">
          {skill.author !== 'Unknown' && <span>by {skill.author}</span>}
          {skill.source === 'project' && <span className="ml-2">• 项目技能</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => onEdit(skill)}>
            <Eye className="h-4 w-4" />
          </Button>
          {!isReadOnly && (
            <>
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => onEdit(skill)}>
                <Pencil className="h-4 w-4" />
              </Button>
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-red-500 hover:bg-red-50 hover:text-red-600"
                  onClick={() => onDelete(skill.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
