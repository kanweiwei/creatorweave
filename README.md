# Browser FS Analyzer

<div align="center">

**Browser-based AI Workspace - Natural language interaction with local files**

[![Rust](https://img.shields.io/badge/Rust-1.75%2B-orange.svg)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-18%2B-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[English](./README.en.md) | 简体中文

</div>

## What is Browser FS Analyzer?

Browser FS Analyzer is a **browser-based AI workspace** that enables natural language interaction with your local files. Built entirely with web technologies, it runs securely in your browser sandbox without uploading any data to external servers.

### Key Product Description

- **AI-Powered Conversations**: Chat naturally with your codebase using advanced AI agents
- **Local File Access**: Direct interaction with files through modern browser APIs
- **Code Intelligence**: Understand, analyze, and manipulate code with intelligent tools
- **Privacy First**: All processing happens locally - your data never leaves your browser

## Features

### Conversation System
- **Threading**: Organize conversations into threads for better context management
- **Message Bubbles**: Rich message display with markdown support, syntax highlighting, and inline code rendering
- **Reasoning Visualization**: See AI thinking process with collapsible reasoning sections
- **Tool Call Display**: View all tool invocations with parameters and results
- **Streaming Support**: Real-time streaming of AI responses for faster feedback

### Code Intelligence
- **File Tree Panel**: Browse and explore your project structure
- **Syntax Highlighting**: Code display with Shiki syntax highlighting
- **File Comparison**: Side-by-side diff view for comparing file versions
- **Code Navigation**: Quick access to files with line numbers and search

### Data Analysis
- **Data Visualization**: Chart.js integration for visualizing file statistics
- **Data Preview**: Preview JSON, CSV, and other structured data formats
- **Batch Operations**: Apply changes to multiple files at once
- **Advanced Search**: Regex-based search with context lines
- **Data Export**: Export analysis results to CSV, JSON, Excel, or image formats

### Workspace Management
- **Theme Support**: Light, dark, and system theme options
- **Keyboard Shortcuts**: Command palette for quick access to all features (press `Ctrl+K` or `Cmd+K`)
- **Recent Files**: Quick access to recently viewed files
- **Layout Persistence**: Your workspace layout is saved automatically
- **Onboarding Tour**: Guided tour for first-time users

### Development Tools
- **Skills Manager**: Create and manage reusable AI skills
- **Tools Panel**: Access development tools and utilities
- **Python Integration**: Execute Python code in the browser (Pyodide)
- **MCP Settings**: Configure Model Context Protocol providers

### User Scenarios
- **Developers**: Code understanding, refactoring, debugging, and code review
- **Data Analysts**: Data exploration, visualization, and report generation
- **Students**: Learning assistance, problem-solving with step-by-step guidance
- **Office Workers**: Document processing, data transformation, and automation

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + K` | Open command palette |
| `Ctrl/Cmd + B` | Toggle sidebar |
| `Ctrl/Cmd + ,` | Open workspace settings |
| `Ctrl/Cmd + 1/2/3` | Switch resource tabs |
| `Shift + ?` | Show keyboard shortcuts |
| `Escape` | Close panels/dialogs |

## Getting Started

### Prerequisites

- Node.js (18+)
- pnpm (recommended) or npm/yarn
- A modern browser with File System Access API support

### Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/browser-fs-analyzer.git
cd browser-fs-analyzer

# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Open http://localhost:3000
```

### Building for Production

```bash
# Build WASM modules
pnpm run build:wasm

# Build web application
pnpm run build

# Output in web/dist/
```

## Development

### Project Structure

```
browser-fs-analyzer/
├── web/                    # React frontend application
│   ├── src/
│   │   ├── agent/         # AI agent logic and tools
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── store/         # State management (Zustand)
│   │   ├── sqlite/        # SQLite database layer
│   │   └── workers/       # Web Workers
│   └── package.json
├── wasm/                   # Rust + WebAssembly modules
├── packages/               # Shared packages
├── relay-server/           # Remote session server
└── mobile-web/            # Mobile web interface
```

### Available Scripts

```bash
# Development
pnpm run dev              # Start development server
pnpm run build            # Build for production
pnpm run preview          # Preview production build

# Testing
pnpm run test             # Run unit tests
pnpm run test:ui          # Run tests with UI
pnpm run test:coverage    # Run tests with coverage
pnpm run test:e2e         # Run E2E tests

# Code Quality
pnpm run lint             # Run ESLint
pnpm run lint:fix         # Fix ESLint issues
pnpm run format           # Format code with Prettier
pnpm run typecheck        # Run TypeScript type checker
```

## Documentation

- [User Guide](./USER_GUIDE.md) - How to use all features
- [Developer Guide](./DEVELOPER_GUIDE.md) - Architecture and development
- [Changelog](./CHANGELOG.md) - Version history and changes

## Browser Compatibility

| Browser | Version | File System Access | OPFS | SQLite WASM |
|---------|---------|-------------------|------|-------------|
| Chrome | 86+ | Full support | Full support | Full support |
| Edge | 86+ | Full support | Full support | Full support |
| Firefox | 111+ | Partial | Partial | Partial* |
| Safari | 16.4+ | No | No | Fallback to IDB |

*Firefox requires COOP/COEP headers to be configured.

## Contributing

We welcome contributions! Please see our [Developer Guide](./DEVELOPER_GUIDE.md) for details on:

- Setting up your development environment
- Running tests
- Code style guidelines
- Submitting pull requests

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Acknowledgments

- [wasm-bindgen](https://github.com/rustwasm/wasm-bindgen) - Rust to WebAssembly bindings
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [Zustand](https://github.com/pmndrs/zustand) - Lightweight state management
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [SQLite WASM](https://sqlite.org/wasm) - SQLite in WebAssembly

---

<div align="center">

**Made with ❤️ by the community**

</div>
