/**
 * WorkflowEdgeCustom - Refined edge with smooth bezier curves.
 * Clean, professional styling with subtle hover effects.
 */

import { memo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
  useReactFlow,
} from '@xyflow/react'
import { cn } from '@creatorweave/ui'

function WorkflowEdgeCustom({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}: EdgeProps) {
  const { setEdges } = useReactFlow()

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25,
  })

  const onEdgeClick = (evt: React.MouseEvent) => {
    evt.stopPropagation()
    setEdges((edges) => edges.filter((e) => e.id !== id))
  }

  return (
    <>
      {/* Invisible wide path for easier interaction */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="cursor-pointer"
        onClick={onEdgeClick}
      />

      {/* Main edge path */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected ? 2 : 1.5,
          stroke: selected
            ? 'var(--edge-color, #6366f1)'
            : 'var(--edge-color, #a1a1aa)',
        }}
        className={cn(
          'transition-all duration-200',
          selected ? 'opacity-100' : 'opacity-60 hover:opacity-100'
        )}
      />

      {/* Animated flow dots */}
      <circle
        r="2"
        fill={selected ? '#6366f1' : '#a1a1aa'}
        className={cn(
          'animate-edge-flow',
          selected ? 'opacity-100' : 'opacity-50'
        )}
      >
        <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
      </circle>

      {/* Delete button on selection */}
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <button
              type="button"
              onClick={onEdgeClick}
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full',
                'bg-neutral-100 dark:bg-neutral-800',
                'text-neutral-400 dark:text-neutral-500',
                'opacity-0 transition-all hover:scale-110 hover:bg-red-100 hover:text-red-500',
                'dark:hover:bg-red-950 dark:hover:text-red-400',
                'group-hover:opacity-100'
              )}
            >
              <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 2L10 10M10 2L2 10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const MemoizedWorkflowEdgeCustom = memo(WorkflowEdgeCustom)
