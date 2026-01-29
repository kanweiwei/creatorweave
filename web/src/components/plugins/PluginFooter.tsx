/**
 * Plugin Footer Component - Neo-Brutal Tech Design
 *
 * Status bar with tech decorations
 */

interface PluginFooterProps {
  stats: {
    total: number
    loaded: number
    error: number
    loading: number
  }
}

export function PluginFooter({ stats }: PluginFooterProps) {
  return (
    <footer className="npf-footer">
      {/* Top decorative line */}
      <div className="npf-line-top">
        <div className="npf-line-segment"></div>
        <div className="npf-line-segment npf-line-segment--long"></div>
        <div className="npf-line-segment"></div>
      </div>

      <div className="npf-content">
        <div className="npf-section">
          <span className="npf-label">SYSTEM_STATUS</span>
          <div className="npf-stats">
            <div className="npf-stat">
              <span className="npf-stat-dot npf-stat-dot--green"></span>
              <span className="npf-stat-text">{stats.loaded} ACTIVE</span>
            </div>
            {stats.loading > 0 && (
              <div className="npf-stat">
                <span className="npf-stat-dot npf-stat-dot--cyan"></span>
                <span className="npf-stat-text">{stats.loading} LOADING</span>
              </div>
            )}
            {stats.error > 0 && (
              <div className="npf-stat">
                <span className="npf-stat-dot npf-stat-dot--red"></span>
                <span className="npf-stat-text">{stats.error} FAULT</span>
              </div>
            )}
          </div>
        </div>

        <div className="npf-section">
          <span className="npf-label">MODULE_COUNT</span>
          <span className="npf-count">{stats.total.toString().padStart(2, '0')}</span>
        </div>

        <div className="npf-section npf-section--right">
          <div className="npf-decoration">
            <span className="npf-deco-char">M</span>
            <span className="npf-deco-char">O</span>
            <span className="npf-deco-char">D</span>
            <span className="npf-deco-char">U</span>
            <span className="npf-deco-char">L</span>
            <span className="npf-deco-char">E</span>
            <span className="npf-deco-char">_</span>
            <span className="npf-deco-char">S</span>
            <span className="npf-deco-char">Y</span>
            <span className="npf-deco-char">S</span>
          </div>
        </div>
      </div>

      {/* Bottom scan effect */}
      <div className="npf-scan"></div>
    </footer>
  )
}
