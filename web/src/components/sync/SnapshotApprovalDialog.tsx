import {
  BrandButton,
  BrandDialog,
  BrandDialogBody,
  BrandDialogContent,
  BrandDialogFooter,
  BrandDialogHeader,
  BrandDialogTitle,
} from '@creatorweave/ui'
import { Sparkles } from 'lucide-react'

interface SnapshotApprovalDialogProps {
  open: boolean
  pendingCount: number
  summary: string
  summaryError: string | null
  generatingSummary: boolean
  isSyncing: boolean
  onOpenChange: (open: boolean) => void
  onSummaryChange: (value: string) => void
  onGenerateSummary: () => Promise<void> | void
  onConfirm: () => Promise<void> | void
}

export function SnapshotApprovalDialog({
  open,
  pendingCount,
  summary,
  summaryError,
  generatingSummary,
  isSyncing,
  onOpenChange,
  onSummaryChange,
  onGenerateSummary,
  onConfirm,
}: SnapshotApprovalDialogProps) {
  return (
    <BrandDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSyncing) return
        onOpenChange(nextOpen)
      }}
    >
      <BrandDialogContent className="max-w-lg">
        <BrandDialogHeader>
          <BrandDialogTitle>创建快照</BrandDialogTitle>
        </BrandDialogHeader>
        <BrandDialogBody>
          <div className="space-y-3">
            <p className="text-sm text-secondary">
              将审批通过 <span className="font-semibold text-primary">{pendingCount}</span> 个变更，并创建快照记录。
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-secondary">快照描述</label>
                <BrandButton
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={generatingSummary || isSyncing}
                  onClick={onGenerateSummary}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {generatingSummary ? '生成中...' : 'AI 生成'}
                </BrandButton>
              </div>
              <textarea
                value={summary}
                onChange={(e) => onSummaryChange(e.target.value)}
                rows={8}
                className="w-full resize-y rounded-md border border-subtle bg-background px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="输入快照说明（可多行，首行可作为标题）"
              />
              {summaryError && (
                <p className="text-xs text-warning">{summaryError}</p>
              )}
            </div>
          </div>
        </BrandDialogBody>
        <BrandDialogFooter>
          <BrandButton variant="ghost" disabled={isSyncing} onClick={() => onOpenChange(false)}>
            取消
          </BrandButton>
          <BrandButton
            variant="primary"
            disabled={isSyncing || summary.trim().length === 0}
            onClick={onConfirm}
          >
            {isSyncing ? '处理中...' : '确认审批通过'}
          </BrandButton>
        </BrandDialogFooter>
      </BrandDialogContent>
    </BrandDialog>
  )
}
