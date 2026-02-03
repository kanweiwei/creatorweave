import * as React from "react"
import { Settings, X } from "lucide-react"
import {
  BrandDialog,
  BrandDialogClose,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
} from "../modals/dialog"
import { BrandInput } from "../inputs/input"
import { BrandSlider } from "../sliders/slider"
import { BrandSelect, BrandSelectContent, BrandSelectItem, BrandSelectTrigger, BrandSelectValue } from "../dropdowns/select"

export interface SettingsDialogProps {
  /** Whether the dialog is open */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Current LLM provider */
  provider?: string
  /** Callback when provider changes */
  onProviderChange?: (provider: string) => void
  /** API Key value */
  apiKey?: string
  /** Callback when API key changes */
  onApiKeyChange?: (key: string) => void
  /** Model name */
  model?: string
  /** Callback when model changes */
  onModelChange?: (model: string) => void
  /** Temperature value (0-100) */
  temperature?: number
  /** Callback when temperature changes */
  onTemperatureChange?: (value: number[]) => void
  /** Max tokens */
  maxTokens?: number
  /** Callback when max tokens changes */
  onMaxTokensChange?: (tokens: number) => void
}

const providers = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "ollama", label: "Ollama" },
]

const models = [
  { value: "gpt-4", label: "GPT-4" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  { value: "claude-3-opus", label: "Claude 3 Opus" },
  { value: "claude-3-sonnet", label: "Claude 3 Sonnet" },
]

const SettingsDialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BrandDialogContent> & SettingsDialogProps
>(({ className, provider, onProviderChange, apiKey, onApiKeyChange, model, onModelChange, temperature = 50, onTemperatureChange, maxTokens = 2048, onMaxTokensChange, ...props }, ref) => {
  return (
    <BrandDialogContent ref={className} className="w-[448px] rounded-xl p-0 gap-0" {...props}>
      {/* Header */}
      <BrandDialogHeader className="h-14 px-6 border-b border-gray-200">
        <div className="flex items-center gap-2.5">
          <Settings className="h-[18px] w-[18px] text-primary-600" />
          <BrandDialogTitle className="text-base font-semibold text-primary">设置</BrandDialogTitle>
        </div>
        <BrandDialogClose className="text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </BrandDialogClose>
      </BrandDialogHeader>

      {/* Body */}
      <div className="px-6 py-6 space-y-6">
        {/* LLM Provider */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-primary">LLM 服务商</label>
          <BrandSelect value={provider} onValueChange={onProviderChange}>
            <BrandSelectTrigger className="h-10">
              <BrandSelectValue placeholder="选择服务商" />
            </BrandSelectTrigger>
            <BrandSelectContent>
              {providers.map((p) => (
                <BrandSelectItem key={p.value} value={p.value}>
                  {p.label}
                </BrandSelectItem>
              ))}
            </BrandSelectContent>
          </BrandSelect>
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-primary">API Key</label>
          <BrandInput
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange?.(e.target.value)}
            placeholder="sk-..."
            className="h-10"
          />
          <p className="text-xs text-muted">API Key 仅存储在浏览器本地，不会上传到服务器</p>
        </div>

        {/* Model Name */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-primary">模型名称</label>
          <BrandSelect value={model} onValueChange={onModelChange}>
            <BrandSelectTrigger className="h-10">
              <BrandSelectValue placeholder="选择模型" />
            </BrandSelectTrigger>
            <BrandSelectContent>
              {models.map((m) => (
                <BrandSelectItem key={m.value} value={m.value}>
                  {m.label}
                </BrandSelectItem>
              ))}
            </BrandSelectContent>
          </BrandSelect>
        </div>

        {/* Temperature */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-primary">Temperature</label>
            <span className="text-sm text-secondary">{temperature / 100}</span>
          </div>
          <BrandSlider
            value={[temperature]}
            onValueChange={onTemperatureChange}
            max={100}
            step={1}
          />
        </div>

        {/* Max Tokens */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-primary">Max Tokens</label>
          <BrandInput
            type="number"
            value={maxTokens}
            onChange={(e) => onMaxTokensChange?.(parseInt(e.target.value) || 0)}
            placeholder="2048"
            className="h-10"
          />
        </div>
      </div>
    </BrandDialogContent>
  )
})
SettingsDialogContent.displayName = "SettingsDialogContent"

const SettingsDialog = React.forwardRef<
  React.ElementRef<typeof BrandDialog>,
  React.ComponentPropsWithoutRef<typeof BrandDialog> & SettingsDialogProps
>(({ open, onOpenChange, ...props }, ref) => {
  return (
    <BrandDialog open={open} onOpenChange={onOpenChange}>
      <SettingsDialogContent ref={ref} {...props} />
    </BrandDialog>
  )
})
SettingsDialog.displayName = "SettingsDialog"

export { SettingsDialog, SettingsDialogContent }
