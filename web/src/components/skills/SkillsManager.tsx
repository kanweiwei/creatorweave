/**
 * SkillsManager - Main skills management dialog.
 *
 * Displays all skills grouped by source (project/user/builtin)
 * with search, filter, and management actions.
 * Optimized: adaptive height, empty group handling, debounced search,
 * custom delete confirmation, separated view/edit modes.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Plus, Search, RefreshCw, FolderOpen, User, Building, X, Inbox, AlertTriangle } from 'lucide-react'
import {
  BrandDialog,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandDialogClose,
  BrandButton,
  BrandInput,
  BrandAccordion,
  BrandAccordionItem,
  BrandAccordionTrigger,
  BrandAccordionContent,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@creatorweave/ui'
import { SkillCard } from './SkillCard'
import { SkillEditor } from './SkillEditor'
import { useSkillsStore } from '@/store/skills.store'
import type { SkillMetadata } from '@/skills/skill-types'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'
import { getSkillManager } from '@/skills/skill-manager'
import { useProjectStore } from '@/store/project.store'

interface SkillsManagerProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog is closed */
  onClose: () => void
  /** Optional project directory handle for re-scan/re-register */
  directoryHandle?: FileSystemDirectoryHandle | null
}

type FilterType = 'all' | 'enabled' | 'disabled'
type EditorMode = 'view' | 'edit' | undefined

export function SkillsManager({ open, onClose, directoryHandle = null }: SkillsManagerProps) {
  const skillsStore = useSkillsStore()
  const activeProjectId = useProjectStore((s) => s.activeProjectId || null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [refreshing, setRefreshing] = useState(false)
  const t = useT()

  // Debounce search input (300ms)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(value)
    }, 300)
  }, [])

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [])

  // Skill editor state
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingSkill, setEditingSkill] = useState<SkillMetadata | undefined>()
  const [editorMode, setEditorMode] = useState<EditorMode>()

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  // Load skills when dialog opens
  useEffect(() => {
    if (open && !skillsStore.loaded) {
      skillsStore.loadSkills()
    }
  }, [open, skillsStore])

  // Group and filter skills (uses debounced query)
  const { projectSkills, userSkills, builtinSkills, totalFiltered } = useMemo(() => {
    let filtered = skillsStore.skills

    // Apply search filter with debounced query
    if (debouncedQuery) {
      const query = debouncedQuery.toLowerCase()
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query) ||
          s.tags.some((tag) => tag.toLowerCase().includes(query))
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
      totalFiltered: filtered.length,
    }
  }, [skillsStore.skills, debouncedQuery, filterType])

  // Determine which accordion groups should be open by default:
  // only groups that have skills; empty groups are collapsed
  const defaultAccordionValues = useMemo(() => {
    const values: string[] = []
    if (projectSkills.length > 0) values.push('project')
    if (userSkills.length > 0) values.push('user')
    if (builtinSkills.length > 0) values.push('builtin')
    return values
  }, [projectSkills.length, userSkills.length, builtinSkills.length])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      if (directoryHandle) {
        const manager = getSkillManager()
        const { errors } = await manager.scanProject(directoryHandle, activeProjectId)
        if (errors.length > 0) {
          console.warn('[SkillsManager] Project skill re-scan completed with errors:', errors)
        }
      }
      await skillsStore.loadSkills()
    } finally {
      setRefreshing(false)
    }
  }, [directoryHandle, skillsStore, activeProjectId])

  const handleToggle = useCallback(
    async (id: string, enabled: boolean) => {
      await skillsStore.toggleSkill(id, enabled)
    },
    [skillsStore]
  )

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteTarget) {
      await skillsStore.deleteSkill(deleteTarget.id)
      setDeleteTarget(null)
    }
  }, [skillsStore, deleteTarget])

  const handleView = useCallback((skill: SkillMetadata) => {
    setEditingSkill(skill)
    setEditorMode('view')
    setEditorOpen(true)
  }, [])

  const handleEdit = useCallback((skill: SkillMetadata) => {
    setEditingSkill(skill)
    setEditorMode('edit')
    setEditorOpen(true)
  }, [])

  const handleCreateNew = useCallback(() => {
    setEditingSkill(undefined)
    setEditorMode('edit')
    setEditorOpen(true)
  }, [])

  const handleEditorClose = useCallback(() => {
    setEditorOpen(false)
    setEditingSkill(undefined)
    setEditorMode(undefined)
  }, [])

  // Compute stats for footer
  const enabledCount = skillsStore.skills.filter((s) => s.enabled).length
  const totalCount = skillsStore.skills.length

  return (
    <>
      <BrandDialog open={open} onOpenChange={onClose}>
        <BrandDialogContent className="flex max-h-[min(700px,85vh)] max-w-2xl flex-col overflow-hidden p-0">
          {/* Header */}
          <BrandDialogHeader className="h-16 px-6">
            <BrandDialogTitle className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {t('skills.title')}
            </BrandDialogTitle>
            <BrandDialogClose className="text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300">
              <X className="h-5 w-5" />
            </BrandDialogClose>
          </BrandDialogHeader>

          {/* Search & Filter Bar */}
          <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-6 py-3 dark:border-neutral-700">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <BrandInput
                placeholder={t('skills.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="!h-9 !py-2 pl-9"
              />
            </div>
            <Tabs value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
              <TabsList variant="segment" className="h-9">
                <TabsTrigger variant="segment" value="all" className="text-sm">
                  {t('skills.filterAll')} ({totalCount})
                </TabsTrigger>
                <TabsTrigger variant="segment" value="enabled" className="text-sm">
                  {t('skills.filterEnabled')}
                </TabsTrigger>
                <TabsTrigger variant="segment" value="disabled" className="text-sm">
                  {t('skills.filterDisabled')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <BrandButton
              iconButton
              onClick={handleRefresh}
              disabled={refreshing}
              title={t('common.refresh')}
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            </BrandButton>
          </div>

          {/* Skills List - scrollable with adaptive height */}
          <div className="custom-scrollbar flex-1 overflow-y-auto px-6 py-4">
            {/* No results state */}
            {totalFiltered === 0 && (debouncedQuery || filterType !== 'all') ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-neutral-400 dark:text-neutral-500">
                <Inbox className="h-8 w-8 opacity-40" />
                <p className="text-sm">{t('skills.noResults') || 'No skills match your search'}</p>
                {debouncedQuery && (
                  <p className="text-xs text-neutral-300 dark:text-neutral-600">
                    &quot;{debouncedQuery}&quot;
                  </p>
                )}
              </div>
            ) : (
              <BrandAccordion type="multiple" defaultValue={defaultAccordionValues}>
                {/* Project Skills */}
                <SkillGroup
                  value="project"
                  icon={<FolderOpen className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />}
                  label={t('skills.projectSkills')}
                  skills={projectSkills}
                  emptyHidden={projectSkills.length === 0 && (debouncedQuery !== '' || filterType !== 'all')}
                  isReadOnly
                  onToggle={handleToggle}
                  onView={handleView}
                  onEdit={handleEdit}
                  emptyText={t('skills.empty')}
                  t={t}
                />

                {/* User Skills */}
                <SkillGroup
                  value="user"
                  icon={<User className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />}
                  label={t('skills.mySkills')}
                  skills={userSkills}
                  emptyHidden={userSkills.length === 0 && (debouncedQuery !== '' || filterType !== 'all')}
                  onToggle={handleToggle}
                  onView={handleView}
                  onEdit={handleEdit}
                  onDelete={(id) => {
                    const skill = skillsStore.skills.find((s) => s.id === id)
                    if (skill) {
                      setDeleteTarget({ id, name: skill.name })
                    }
                  }}
                  emptyText={t('skills.empty')}
                  t={t}
                />

                {/* Builtin Skills */}
                <SkillGroup
                  value="builtin"
                  icon={<Building className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />}
                  label={t('skills.builtinSkills')}
                  skills={builtinSkills}
                  emptyHidden={builtinSkills.length === 0 && (debouncedQuery !== '' || filterType !== 'all')}
                  isReadOnly
                  onToggle={handleToggle}
                  onView={handleView}
                  onEdit={handleEdit}
                  emptyText={t('skills.empty')}
                  t={t}
                />
              </BrandAccordion>
            )}
          </div>

          {/* Footer */}
          <div className="flex h-14 shrink-0 items-center justify-between border-t border-neutral-200 px-6 dark:border-neutral-700">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              <span className="font-medium text-neutral-700 dark:text-neutral-200">
                {enabledCount}
              </span>
              {' / '}
              {totalCount} {t('skills.enabled').toLowerCase()}
            </span>
            <div className="flex items-center gap-2">
              <BrandButton variant="outline" onClick={onClose}>
                {t('common.close')}
              </BrandButton>
              <BrandButton onClick={handleCreateNew}>
                <Plus className="mr-1.5 h-4 w-4" />
                {t('skills.createNew')}
              </BrandButton>
            </div>
          </div>
        </BrandDialogContent>
      </BrandDialog>

      {/* Skill Editor Dialog */}
      <SkillEditor
        skill={editingSkill}
        open={editorOpen}
        onClose={handleEditorClose}
        readOnly={editorMode === 'view'}
      />

      {/* Delete Confirmation Dialog */}
      <BrandDialog
        open={deleteTarget !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleteTarget(null)
        }}
      >
        <BrandDialogContent className="max-w-sm p-0">
          <div className="flex flex-col items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                {t('skills.deleteTitle') || 'Delete Skill'}
              </h3>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                {(t('skills.deleteConfirmMessage') || 'Are you sure you want to delete "{name}"? This action cannot be undone.').replace('{name}', deleteTarget?.name || '')}
              </p>
            </div>
            <div className="flex w-full gap-3">
              <BrandButton
                variant="outline"
                className="flex-1"
                onClick={() => setDeleteTarget(null)}
              >
                {t('common.cancel') || 'Cancel'}
              </BrandButton>
              <BrandButton
                variant="danger"
                className="flex-1"
                onClick={handleDeleteConfirm}
              >
                {t('skills.deleteConfirm') || 'Delete'}
              </BrandButton>
            </div>
          </div>
        </BrandDialogContent>
      </BrandDialog>
    </>
  )
}

// ============================================================================
// SkillGroup - Renders a group of skills in an accordion section
// ============================================================================

interface SkillGroupProps {
  value: string
  icon: React.ReactNode
  label: string
  skills: SkillMetadata[]
  /** Hide entire group when empty and searching/filtering */
  emptyHidden: boolean
  isReadOnly?: boolean
  onToggle: (id: string, enabled: boolean) => void
  onView: (skill: SkillMetadata) => void
  onEdit: (skill: SkillMetadata) => void
  onDelete?: (id: string) => void
  emptyText: string
  t: (key: string) => string
}

function SkillGroup({
  value,
  icon,
  label,
  skills,
  emptyHidden,
  isReadOnly,
  onToggle,
  onView,
  onEdit,
  onDelete,
  emptyText,
}: SkillGroupProps) {
  // Hide empty groups when user is actively searching/filtering
  if (emptyHidden && skills.length === 0) {
    return null
  }

  return (
    <BrandAccordionItem value={value}>
      <BrandAccordionTrigger className="rounded-t-lg px-4 py-3 hover:no-underline data-[state=open]:bg-neutral-50 dark:data-[state=open]:bg-neutral-800">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {label}
          </span>
          <span className="text-xs text-neutral-400 dark:text-neutral-500">({skills.length})</span>
        </div>
      </BrandAccordionTrigger>
      <BrandAccordionContent className="pb-0 pt-0">
        <div className="space-y-2 rounded-b-lg bg-neutral-50/50 p-4 dark:bg-neutral-900/50">
          {skills.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-4 text-neutral-400 dark:text-neutral-500">
              <Inbox className="h-4 w-4 opacity-50" />
              <p className="text-xs">{emptyText}</p>
            </div>
          ) : (
            skills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                isReadOnly={isReadOnly}
                onToggle={onToggle}
                onView={onView}
                onEdit={isReadOnly ? onView : onEdit}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </BrandAccordionContent>
    </BrandAccordionItem>
  )
}
