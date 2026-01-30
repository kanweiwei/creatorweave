/**
 * SkillsManager - Main skills management dialog.
 *
 * Displays all skills grouped by source (project/user/builtin)
 * with search, filter, and management actions.
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Plus, Search, RefreshCw, FolderOpen, User, Building } from 'lucide-react'
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SkillCard } from './SkillCard'
import { useSkillsStore } from '@/store/skills.store'
import type { SkillMetadata } from '@/skills/skill-types'
import { cn } from '@/lib/utils'

interface SkillsManagerProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog is closed */
  onClose: () => void
}

type FilterType = 'all' | 'enabled' | 'disabled'

export function SkillsManager({ open, onClose }: SkillsManagerProps) {
  const skillsStore = useSkillsStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [refreshing, setRefreshing] = useState(false)

  // Load skills when dialog opens
  useEffect(() => {
    if (open && !skillsStore.loaded) {
      skillsStore.loadSkills()
    }
  }, [open, skillsStore])

  // Group and filter skills
  const { projectSkills, userSkills, builtinSkills } = useMemo(() => {
    let filtered = skillsStore.skills

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query) ||
          s.tags.some((t) => t.toLowerCase().includes(query))
      )
    }

    // Apply enabled filter
    if (filterType === 'enabled') {
      filtered = filtered.filter((s) => s.enabled)
    } else if (filterType === 'disabled') {
      filtered = filtered.filter((s) => !s.enabled)
    }

    // Group by source
    return {
      projectSkills: filtered.filter((s) => s.source === 'project'),
      userSkills: filtered.filter((s) => s.source === 'user'),
      builtinSkills: filtered.filter((s) => s.source === 'builtin'),
    }
  }, [skillsStore.skills, searchQuery, filterType])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await skillsStore.loadSkills()
    setRefreshing(false)
  }, [skillsStore])

  const handleToggle = useCallback(
    async (id: string, enabled: boolean) => {
      await skillsStore.toggleSkill(id, enabled)
    },
    [skillsStore]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      if (confirm('确定要删除这个技能吗？')) {
        await skillsStore.deleteSkill(id)
      }
    },
    [skillsStore]
  )

  const handleEdit = useCallback((skill: SkillMetadata) => {
    // TODO: Open skill editor
    console.log('Edit skill:', skill)
  }, [])

  return (
    <DialogContent
      open={open}
      onOpenChange={onClose}
      className="flex max-h-[80vh] max-w-2xl flex-col overflow-hidden"
    >
      <DialogHeader>
        <DialogTitle>🧩 技能管理</DialogTitle>
      </DialogHeader>

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="搜索技能..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center rounded-md border border-neutral-200">
          <FilterTab active={filterType === 'all'} onClick={() => setFilterType('all')}>
            全部 ({skillsStore.skills.length})
          </FilterTab>
          <FilterTab active={filterType === 'enabled'} onClick={() => setFilterType('enabled')}>
            启用
          </FilterTab>
          <FilterTab active={filterType === 'disabled'} onClick={() => setFilterType('disabled')}>
            禁用
          </FilterTab>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          disabled={refreshing}
          title="刷新"
        >
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
        </Button>
      </div>

      {/* Skills List */}
      <div className="-mx-6 flex-1 space-y-6 overflow-y-auto px-6">
        {/* Project Skills */}
        {projectSkills.length > 0 && (
          <SkillGroup
            title="项目技能"
            icon={<FolderOpen className="h-4 w-4" />}
            skills={projectSkills}
            onToggle={handleToggle}
            onEdit={handleEdit}
            isReadOnly
          />
        )}

        {/* User Skills */}
        <SkillGroup
          title="我的技能"
          icon={<User className="h-4 w-4" />}
          skills={userSkills}
          onToggle={handleToggle}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />

        {/* Builtin Skills */}
        <SkillGroup
          title="内置技能"
          icon={<Building className="h-4 w-4" />}
          skills={builtinSkills}
          onToggle={handleToggle}
          onEdit={handleEdit}
          isReadOnly
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-neutral-200 pt-4">
        <span className="text-sm text-neutral-500">
          {skillsStore.skills.filter((s) => s.enabled).length} / {skillsStore.skills.length} 已启用
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
          <Button
            onClick={() => {
              // TODO: Open skill editor
              console.log('Create new skill')
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            新建
          </Button>
        </div>
      </div>
    </DialogContent>
  )
}

interface SkillGroupProps {
  title: string
  icon: React.ReactNode
  skills: SkillMetadata[]
  onToggle: (id: string, enabled: boolean) => void
  onEdit: (skill: SkillMetadata) => void
  onDelete?: (id: string) => void
  isReadOnly?: boolean
}

function SkillGroup({
  title,
  icon,
  skills,
  onToggle,
  onEdit,
  onDelete,
  isReadOnly,
}: SkillGroupProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (skills.length === 0) return null

  return (
    <div>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 text-sm font-medium text-neutral-700 transition-colors hover:text-neutral-900"
      >
        {icon}
        <span>{title}</span>
        <span className="text-neutral-400">({skills.length})</span>
        <span className={cn('transition-transform', collapsed && 'rotate-180')}>▼</span>
      </button>

      {!collapsed && (
        <div className="mt-3 space-y-2">
          {skills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              isReadOnly={isReadOnly}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterTab({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 text-sm transition-colors',
        active ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'
      )}
    >
      {children}
    </button>
  )
}
