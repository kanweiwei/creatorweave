/**
 * BFSA Plugin Iframe Styles
 * Shared CSS styles injected into plugin iframe
 */

export const IFRAME_STYLES = `
  :root {
    --bfsa-primary: #2563eb;
    --bfsa-primary-hover: #1d4ed8;
    --bfsa-success: #16a34a;
    --bfsa-warning: #ca8a04;
    --bfsa-danger: #dc2626;
    --bfsa-gray-50: #f9fafb;
    --bfsa-gray-100: #f3f4f6;
    --bfsa-gray-200: #e5e7eb;
    --bfsa-gray-400: #9ca3af;
    --bfsa-gray-500: #6b7280;
    --bfsa-gray-600: #4b5563;
    --bfsa-gray-700: #374151;
    --bfsa-gray-900: #111827;
  }

  * { box-sizing: border-box; }

  body {
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: var(--bfsa-gray-700);
    margin: 0;
    padding: 16px;
    background: transparent;
  }

  h1, h2, h3, h4, h5, h6 {
    margin: 0 0 12px 0;
    font-weight: 600;
    color: var(--bfsa-gray-900);
  }

  h1 { font-size: 24px; }
  h2 { font-size: 20px; }
  h3 { font-size: 16px; }

  p { margin: 0 0 12px 0; }

  a {
    color: var(--bfsa-primary);
    text-decoration: none;
  }
  a:hover { text-decoration: underline; }

  code, pre {
    font-family: ui-monospace, "SF Mono", Monaco, "Cascadia Code", monospace;
    background: var(--bfsa-gray-100);
    border-radius: 4px;
  }

  code {
    padding: 2px 6px;
    font-size: 13px;
  }

  pre {
    padding: 12px;
    overflow-x: auto;
  }

  pre code {
    padding: 0;
    background: transparent;
  }

  /* Card Component */
  .bfsa-card {
    background: white;
    border: 1px solid var(--bfsa-gray-200);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 12px;
  }

  /* Metrics Grid */
  .bfsa-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
    margin: 12px 0;
  }

  .bfsa-metric {
    background: var(--bfsa-gray-50);
    border-radius: 6px;
    padding: 12px;
  }

  .bfsa-metric-label {
    font-size: 12px;
    color: var(--bfsa-gray-600);
    margin-bottom: 4px;
  }

  .bfsa-metric-value {
    font-size: 20px;
    font-weight: 600;
    color: var(--bfsa-gray-900);
  }

  /* Table */
  .bfsa-table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
  }

  .bfsa-table th,
  .bfsa-table td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--bfsa-gray-200);
  }

  .bfsa-table th {
    font-weight: 600;
    color: var(--bfsa-gray-700);
    background: var(--bfsa-gray-50);
  }

  .bfsa-table tr:last-child td {
    border-bottom: none;
  }

  /* Badge */
  .bfsa-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 500;
  }

  .bfsa-badge-success { background: #dcfce7; color: #166534; }
  .bfsa-badge-warning { background: #fef9c3; color: #854d0e; }
  .bfsa-badge-error { background: #fee2e2; color: #991b1b; }
  .bfsa-badge-info { background: #dbeafe; color: #1e40af; }

  /* Button */
  .bfsa-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .bfsa-btn-primary {
    background: var(--bfsa-primary);
    color: white;
  }
  .bfsa-btn-primary:hover { background: var(--bfsa-primary-hover); }

  .bfsa-btn-secondary {
    background: white;
    border: 1px solid var(--bfsa-gray-200);
    color: var(--bfsa-gray-700);
  }
  .bfsa-btn-secondary:hover { background: var(--bfsa-gray-50); }

  .bfsa-btn-danger {
    background: var(--bfsa-danger);
    color: white;
  }
  .bfsa-btn-danger:hover { opacity: 0.9; }

  /* Progress Bar */
  .bfsa-progress {
    width: 100%;
    height: 8px;
    background: var(--bfsa-gray-200);
    border-radius: 4px;
    overflow: hidden;
  }

  .bfsa-progress-bar {
    height: 100%;
    background: var(--bfsa-primary);
    transition: width 0.3s ease;
  }

  /* Tabs */
  .bfsa-tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--bfsa-gray-200);
    margin-bottom: 16px;
  }

  .bfsa-tab {
    padding: 8px 16px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--bfsa-gray-600);
    cursor: pointer;
  }

  .bfsa-tab:hover { color: var(--bfsa-gray-900); }

  .bfsa-tab.active {
    color: var(--bfsa-primary);
    border-bottom-color: var(--bfsa-primary);
  }

  /* Accordion */
  .bfsa-accordion-item {
    border: 1px solid var(--bfsa-gray-200);
    border-radius: 6px;
    margin-bottom: 8px;
    overflow: hidden;
  }

  .bfsa-accordion-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: var(--bfsa-gray-50);
    border: none;
    cursor: pointer;
    font-weight: 500;
  }

  .bfsa-accordion-content {
    padding: 12px 16px;
    border-top: 1px solid var(--bfsa-gray-200);
  }

  /* Input */
  .bfsa-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--bfsa-gray-200);
    border-radius: 6px;
    font-size: 14px;
  }

  .bfsa-input:focus {
    outline: none;
    border-color: var(--bfsa-primary);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  /* Select */
  .bfsa-select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--bfsa-gray-200);
    border-radius: 6px;
    font-size: 14px;
    background: white;
  }
`
