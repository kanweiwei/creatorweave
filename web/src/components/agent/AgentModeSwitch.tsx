/**
 * Agent Mode Switch - Toggle between Plan (read-only) and Act (full access) modes.
 */

import { BrandSwitch } from '@creatorweave/ui'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@creatorweave/ui'
import { getModeDescription, type AgentMode } from '@/agent/agent-mode'

export interface AgentModeSwitchProps {
  /** Current mode */
  mode: AgentMode
  /** Callback when mode changes */
  onModeChange: (mode: AgentMode) => void
  /** Whether the switch is disabled */
  disabled?: boolean
  /** Additional CSS class */
  className?: string
}

const MODE_CONFIG = {
  plan: {
    label: 'Plan',
    icon: '🔍',
    activeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    dotClass: 'bg-amber-400',
  },
  act: {
    label: 'Act',
    icon: '⚡',
    activeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    dotClass: 'bg-blue-500',
  },
} as const

/**
 * Compact toggle - pill-shaped button with icon, label, and mode indicator dot.
 * Clicking toggles between Plan and Act mode.
 */
export function AgentModeSwitchCompact({
  mode,
  onModeChange,
  disabled = false,
  className = '',
}: AgentModeSwitchProps) {
  const config = MODE_CONFIG[mode]
  const nextMode: AgentMode = mode === 'plan' ? 'act' : 'plan'

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onModeChange(nextMode)}
            disabled={disabled}
            className={`
              group relative inline-flex items-center gap-1.5
              rounded-full border px-2.5 py-1
              text-xs font-semibold tracking-wide uppercase
              transition-all duration-200 ease-out
              ${config.activeClass}
              ${disabled
                ? 'opacity-40 cursor-not-allowed'
                : 'cursor-pointer hover:scale-105 active:scale-95'
              }
              ${className}
            `}
            aria-label={`Current: ${mode === 'plan' ? 'Plan' : 'Act'} mode. Click to switch.`}
          >
            {/* Pulsing dot */}
            <span
              className={`
                inline-block h-1.5 w-1.5 rounded-full
                ${config.dotClass}
                ${disabled ? '' : 'animate-pulse'}
              `}
            />
            <span>{config.icon}</span>
            <span>{config.label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6} className="max-w-[220px]">
          <div className="space-y-1.5">
            <p className="text-xs font-medium">
              {config.icon} {config.label} Mode
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {getModeDescription(mode)}
            </p>
            {!disabled && (
              <p className="text-[10px] text-muted-foreground/70">
                Click to switch → {MODE_CONFIG[nextMode].icon} {MODE_CONFIG[nextMode].label}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Full switch variant - uses a toggle Switch with Plan/Act labels on each side.
 */
export function AgentModeSwitch({
  mode,
  onModeChange,
  disabled = false,
  className = '',
}: AgentModeSwitchProps) {
  const isAct = mode === 'act'

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`
              inline-flex items-center gap-2 rounded-lg
              border border-neutral-200 bg-white px-3 py-1.5
              dark:border-neutral-700 dark:bg-neutral-900
              ${disabled ? 'opacity-40' : ''}
              ${className}
            `}
          >
            {/* Plan label */}
            <span
              className={`
                text-xs font-medium transition-colors duration-200
                ${!isAct
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-neutral-400 dark:text-neutral-500'
                }
              `}
            >
              🔍 Plan
            </span>

            <BrandSwitch
              checked={isAct}
              onCheckedChange={(checked) => onModeChange(checked ? 'act' : 'plan')}
              disabled={disabled}
              aria-label={`Switch to ${isAct ? 'Plan' : 'Act'} mode`}
              className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-amber-500"
            />

            {/* Act label */}
            <span
              className={`
                text-xs font-medium transition-colors duration-200
                ${isAct
                  ? 'text-blue-700 dark:text-blue-400'
                  : 'text-neutral-400 dark:text-neutral-500'
                }
              `}
            >
              ⚡ Act
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          <p className="text-xs">{getModeDescription(mode)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
