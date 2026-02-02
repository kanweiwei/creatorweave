# @browser-fs-analyzer/ui

Shared UI components for browser-fs-analyzer.

## Components

### Toast

Temporary notification with auto-dismiss support.

**Variants**: `info` | `warning` | `error` | `success`

```tsx
import { Toast } from '@browser-fs-analyzer/ui'

<Toast
  variant="warning"
  title="Host 已切换目录"
  message="当前目录：browser-fs-analyzer"
/>
```

### useToast Hook

```tsx
import { useToast } from '@browser-fs-analyzer/ui'

function MyComponent() {
  const { showToast, toast, closeToast } = useToast()

  const handleClick = () => {
    showToast({
      variant: 'info',
      title: '通知标题',
      message: '通知内容',
      duration: 5000,
    })
  }

  return <button onClick={handleClick}>Show Toast</button>
}
```

## Development

```bash
# Build
pnpm run build

# Watch mode
pnpm run dev

# Type check
pnpm run typecheck
```

## Integration

This package is part of the browser-fs-analyzer monorepo and uses:
- **React** - UI framework
- **Tailwind CSS** - Styling
- **Vite** - Build tool
- **TypeScript** - Type safety
