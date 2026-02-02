/**
 * LoadingScreen - 重连期间的加载动画
 */

export function LoadingScreen() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-neutral-50 px-4">
      {/* Loading Spinner */}
      <div className="relative w-16 h-16 mb-6">
        <div className="absolute inset-0 rounded-full border-4 border-primary-200"></div>
        <div className="absolute inset-0 rounded-full border-4 border-t-primary-600 animate-spin"></div>
      </div>

      {/* Loading Text */}
      <h2 className="text-lg font-semibold text-neutral-800 mb-2">
        正在重连...
      </h2>
      <p className="text-sm text-neutral-500">
        请稍候，正在恢复会话
      </p>
    </div>
  )
}
