import { useEffect, useMemo, useState } from 'react'
import type { Project, ProjectStats } from '@/sqlite/repositories/project.repository'
import {
  BrandBadge,
  BrandButton,
  BrandCheckbox,
  BrandDialog,
  BrandDialogBody,
  BrandDialogContent,
  BrandDialogFooter,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandInput,
  BrandSelect,
  BrandSelectContent,
  BrandSelectItem,
  BrandSelectTrigger,
  BrandSelectValue,
} from '@browser-fs-analyzer/ui'

interface ProjectHomeProps {
  projects: Project[]
  projectStats?: Record<string, ProjectStats>
  activeProjectId: string
  isLoading?: boolean
  onOpenProject: (projectId: string) => void | Promise<void>
  onCreateProject: (name: string) => void | Promise<void>
  onRenameProject: (projectId: string, name: string) => void | Promise<void>
  onArchiveProject: (projectId: string, archived: boolean) => void | Promise<void>
  onDeleteProject: (projectId: string) => void | Promise<void>
}

const SKIP_ARCHIVE_CONFIRM_KEY = 'project-home:skip-archive-confirm'

export function ProjectHome({
  projects,
  projectStats = {},
  activeProjectId,
  isLoading = false,
  onOpenProject,
  onCreateProject,
  onRenameProject,
  onArchiveProject,
  onDeleteProject,
}: ProjectHomeProps) {
  const [draftName, setDraftName] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'name' | 'workspaces'>('updated')
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active')
  const [isCreating, setIsCreating] = useState(false)
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [archivingProject, setArchivingProject] = useState<Project | null>(null)
  const [skipArchiveConfirm, setSkipArchiveConfirm] = useState(false)
  const [archiveDontAskAgain, setArchiveDontAskAgain] = useState(false)
  const [deletingProject, setDeletingProject] = useState<Project | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isActionSubmitting, setIsActionSubmitting] = useState(false)
  const [pendingProjectAction, setPendingProjectAction] = useState<{
    projectId: string
    type: 'rename' | 'archive' | 'unarchive' | 'delete'
  } | null>(null)

  const visibleProjects = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const byStatus =
      statusFilter === 'all'
        ? projects
        : projects.filter((project) => project.status === statusFilter)
    const filtered = keyword
      ? byStatus.filter((project) => project.name.toLowerCase().includes(keyword))
      : byStatus

    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name, 'zh-Hans-CN')
      }
      if (sortBy === 'created') {
        return b.createdAt - a.createdAt
      }
      if (sortBy === 'workspaces') {
        const countA = projectStats[a.id]?.workspaceCount || 0
        const countB = projectStats[b.id]?.workspaceCount || 0
        return countB - countA
      }
      return b.updatedAt - a.updatedAt
    })
  }, [projects, projectStats, search, sortBy, statusFilter])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem(SKIP_ARCHIVE_CONFIRM_KEY)
    setSkipArchiveConfirm(saved === '1')
  }, [])

  const handleCreate = async () => {
    const name = draftName.trim()
    if (!name) return
    setIsCreating(true)
    try {
      await onCreateProject(name)
      setDraftName('')
    } finally {
      setIsCreating(false)
    }
  }

  const handleRenameOpen = (project: Project) => {
    setRenamingProjectId(project.id)
    setRenameDraft(project.name)
  }

  const handleRenameConfirm = async () => {
    if (!renamingProjectId || !renameDraft.trim()) return
    setIsActionSubmitting(true)
    setPendingProjectAction({ projectId: renamingProjectId, type: 'rename' })
    try {
      await onRenameProject(renamingProjectId, renameDraft.trim())
      setRenamingProjectId(null)
      setRenameDraft('')
    } finally {
      setIsActionSubmitting(false)
      setPendingProjectAction(null)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deletingProject) return
    if (deleteConfirmText !== deletingProject.name) return
    setIsActionSubmitting(true)
    setPendingProjectAction({ projectId: deletingProject.id, type: 'delete' })
    try {
      await onDeleteProject(deletingProject.id)
      setDeletingProject(null)
      setDeleteConfirmText('')
    } finally {
      setIsActionSubmitting(false)
      setPendingProjectAction(null)
    }
  }

  const handleArchiveClick = async (project: Project, isArchived: boolean) => {
    if (isArchived) {
      setPendingProjectAction({ projectId: project.id, type: 'unarchive' })
      try {
        await onArchiveProject(project.id, false)
      } finally {
        setPendingProjectAction(null)
      }
      return
    }

    if (skipArchiveConfirm) {
      setPendingProjectAction({ projectId: project.id, type: 'archive' })
      try {
        await onArchiveProject(project.id, true)
      } finally {
        setPendingProjectAction(null)
      }
      return
    }

    setArchiveDontAskAgain(false)
    setArchivingProject(project)
  }

  const handleArchiveConfirm = async () => {
    if (!archivingProject) return
    setIsActionSubmitting(true)
    setPendingProjectAction({ projectId: archivingProject.id, type: 'archive' })
    try {
      await onArchiveProject(archivingProject.id, true)
      if (archiveDontAskAgain && typeof window !== 'undefined') {
        window.localStorage.setItem(SKIP_ARCHIVE_CONFIRM_KEY, '1')
        setSkipArchiveConfirm(true)
      }
      setArchivingProject(null)
    } finally {
      setIsActionSubmitting(false)
      setPendingProjectAction(null)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-neutral-900">项目</h1>
          <p className="mt-2 text-sm text-neutral-600">选择一个项目进入工作区，或先创建一个新项目。</p>
        </header>

        <div className="mb-8 rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <BrandInput
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void handleCreate()
                }
              }}
              placeholder="输入项目名称"
              className="flex-1"
            />
            <BrandButton
              variant="primary"
              onClick={() => void handleCreate()}
              disabled={isCreating || isLoading || !draftName.trim()}
            >
              创建项目
            </BrandButton>
          </div>
        </div>

        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
              <BrandInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索项目"
                className="w-full sm:max-w-xs"
              />
              <BrandSelect
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as 'active' | 'archived' | 'all')}
              >
                <BrandSelectTrigger className="w-[140px]">
                  <BrandSelectValue />
                </BrandSelectTrigger>
                <BrandSelectContent>
                  <BrandSelectItem value="active">仅活跃</BrandSelectItem>
                  <BrandSelectItem value="all">全部</BrandSelectItem>
                  <BrandSelectItem value="archived">仅归档</BrandSelectItem>
                </BrandSelectContent>
              </BrandSelect>
            </div>
            <BrandSelect
              value={sortBy}
              onValueChange={(value) =>
                setSortBy(value as 'updated' | 'created' | 'name' | 'workspaces')
              }
            >
              <BrandSelectTrigger className="w-[160px]">
                <BrandSelectValue />
              </BrandSelectTrigger>
              <BrandSelectContent>
                <BrandSelectItem value="updated">按最近更新</BrandSelectItem>
                <BrandSelectItem value="created">按创建时间</BrandSelectItem>
                <BrandSelectItem value="name">按名称</BrandSelectItem>
                <BrandSelectItem value="workspaces">按工作区数量</BrandSelectItem>
              </BrandSelectContent>
            </BrandSelect>
          </div>

          {visibleProjects.length === 0 && (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
              <p className="text-sm text-neutral-600">没有匹配的项目，试试其他关键词。</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleProjects.map((project) => {
              const isActive = project.id === activeProjectId
              const stats = projectStats[project.id]
              const canDelete = true
              const isArchived = project.status === 'archived'
              const isProjectActionPending = pendingProjectAction?.projectId === project.id
              return (
                <div
                  key={project.id}
                  className="group rounded-xl border border-neutral-200 bg-white p-5 text-left transition hover:border-primary-300 hover:shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-base font-medium text-neutral-900">{project.name}</span>
                    <div className="flex items-center gap-2">
                      {isArchived && (
                        <BrandBadge variant="neutral" shape="pill">
                          已归档
                        </BrandBadge>
                      )}
                      {isActive && (
                        <BrandBadge type="tag" color="primary">
                          当前
                        </BrandBadge>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-neutral-500">
                    更新于 {new Date(project.updatedAt).toLocaleString()}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500">
                    <span>工作区 {stats?.workspaceCount || 0}</span>
                    <span>
                      最近活跃{' '}
                      {stats?.lastWorkspaceAccessAt
                        ? new Date(stats.lastWorkspaceAccessAt).toLocaleString()
                        : '暂无'}
                    </span>
                  </div>
                  <p className="mt-4 text-sm text-primary-700 transition group-hover:text-primary-800">
                    进入项目
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <BrandButton
                      onClick={() => void onOpenProject(project.id)}
                      variant="primary"
                      disabled={isLoading || isActionSubmitting}
                    >
                      进入项目
                    </BrandButton>
                    <BrandButton
                      variant="outline"
                      onClick={() => handleRenameOpen(project)}
                      disabled={isProjectActionPending || isActionSubmitting}
                    >
                      {isProjectActionPending && pendingProjectAction?.type === 'rename'
                        ? '处理中...'
                        : '重命名'}
                    </BrandButton>
                    <BrandButton
                      variant="outline"
                      onClick={() => void handleArchiveClick(project, isArchived)}
                      disabled={isProjectActionPending || isActionSubmitting}
                    >
                      {isProjectActionPending &&
                      (pendingProjectAction?.type === 'archive' ||
                        pendingProjectAction?.type === 'unarchive')
                        ? '处理中...'
                        : isArchived
                          ? '取消归档'
                          : '归档'}
                    </BrandButton>
                    {canDelete && (
                      <BrandButton
                        variant="danger"
                        onClick={() => {
                          setDeletingProject(project)
                          setDeleteConfirmText('')
                        }}
                        disabled={isProjectActionPending || isActionSubmitting}
                      >
                        {isProjectActionPending && pendingProjectAction?.type === 'delete'
                          ? '处理中...'
                          : '删除'}
                      </BrandButton>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <BrandDialog
        open={!!renamingProjectId}
        onOpenChange={(open) => {
          if (!open && !isActionSubmitting) {
            setRenamingProjectId(null)
          }
        }}
      >
        <BrandDialogContent className="max-w-md">
          <BrandDialogHeader>
            <BrandDialogTitle>重命名项目</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <BrandInput
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              placeholder="输入新的项目名称"
              disabled={isActionSubmitting}
            />
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="ghost"
              onClick={() => setRenamingProjectId(null)}
              disabled={isActionSubmitting}
            >
              取消
            </BrandButton>
            <BrandButton
              onClick={() => void handleRenameConfirm()}
              disabled={isActionSubmitting || !renameDraft.trim()}
            >
              {isActionSubmitting ? '处理中...' : '保存'}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      <BrandDialog
        open={!!archivingProject}
        onOpenChange={(open) => {
          if (!open && !isActionSubmitting) {
            setArchivingProject(null)
          }
        }}
      >
        <BrandDialogContent className="max-w-md">
          <BrandDialogHeader>
            <BrandDialogTitle>归档项目</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="text-sm text-neutral-700">
              确认归档项目「{archivingProject?.name}」？归档后项目不会默认展示，但可随时取消归档。
            </p>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
              <BrandCheckbox
                checked={archiveDontAskAgain}
                onCheckedChange={(checked) => setArchiveDontAskAgain(Boolean(checked))}
                disabled={isActionSubmitting}
              />
              <span>下次不再提示</span>
            </label>
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="ghost"
              onClick={() => setArchivingProject(null)}
              disabled={isActionSubmitting}
            >
              取消
            </BrandButton>
            <BrandButton onClick={() => void handleArchiveConfirm()} disabled={isActionSubmitting}>
              {isActionSubmitting ? '处理中...' : '确认归档'}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      <BrandDialog
        open={!!deletingProject}
        onOpenChange={(open) => {
          if (!open && !isActionSubmitting) {
            setDeletingProject(null)
            setDeleteConfirmText('')
          }
        }}
      >
        <BrandDialogContent className="max-w-md">
          <BrandDialogHeader>
            <BrandDialogTitle>删除项目</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="text-sm text-neutral-700">
              确认删除项目「{deletingProject?.name}」？该操作会删除项目关联的工作区记录，且不可撤销。
            </p>
            <p className="mt-2 text-xs text-neutral-500">请输入项目名称以确认删除：</p>
            <BrandInput
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={deletingProject?.name || ''}
              disabled={isActionSubmitting}
            />
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="ghost"
              onClick={() => setDeletingProject(null)}
              disabled={isActionSubmitting}
            >
              取消
            </BrandButton>
            <BrandButton
              variant="danger"
              onClick={() => void handleDeleteConfirm()}
              disabled={
                isActionSubmitting ||
                !deletingProject ||
                deleteConfirmText !== deletingProject.name
              }
            >
              {isActionSubmitting ? '处理中...' : '确认删除'}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>
    </div>
  )
}
