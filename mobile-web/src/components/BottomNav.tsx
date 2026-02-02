/**
 * BottomNav - 底部导航栏组件
 * 显示主要导航选项：对话、设置
 */

import { useNavigate, useLocation } from 'react-router-dom'
import { MessageSquare, Settings } from 'lucide-react'

interface NavItem {
  path: string
  icon: React.ElementType
  label: string
  matchSubPaths?: boolean
}

const navItems: NavItem[] = [
  { path: '/chats', icon: MessageSquare, label: '对话', matchSubPaths: true },
  { path: '/settings', icon: Settings, label: '设置' },
]

export function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()

  const getActivePath = () => {
    for (const item of navItems) {
      if (item.matchSubPaths) {
        if (location.pathname === item.path || location.pathname.startsWith(item.path + '/')) {
          return item.path
        }
      } else {
        if (location.pathname === item.path) return item.path
      }
    }
    return null
  }

  const activePath = getActivePath()

  return (
    <nav className="h-14 flex-shrink-0 bg-white border-t border-neutral-200 safe-bottom flex items-center justify-around">
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive = activePath === item.path
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors active:scale-95 ${
              isActive ? 'text-primary-600' : 'text-neutral-400'
            }`}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon className="h-6 w-6" />
            <span className="text-xs">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
