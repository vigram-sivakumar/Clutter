# Clutter Notes 2.0

A native macOS note-taking application built with a modern monorepo architecture.

## 🏗️ Project Structure

This is a Turborepo monorepo containing:

```
clutter-notes/
├── apps/
│   └── desktop/      # Tauri native macOS application (React + Rust)
├── packages/
│   ├── domain/       # Pure types & constants
│   ├── state/        # Zustand stores
│   ├── shared/       # Utilities & hooks
│   ├── editor/       # TipTap-based editor engine
│   └── ui/           # Design system (Notion-inspired)
└── [root configs]    # Turborepo, TypeScript, ESLint, Prettier, etc.
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Rust** (for Tauri) - [Install Rust](https://www.rust-lang.org/tools/install)
- **macOS** - Currently Mac-only (Windows/Linux support possible with Tauri)

### Installation

1. **Clone and install dependencies:**

```bash
npm install
```

2. **Set up environment variables:**

Copy `.env.example` to `.env` and configure as needed:

```bash
cp .env.example .env
```

3. **Initialize Husky (Git hooks):**

```bash
npm run prepare
```

## 📦 Available Scripts

### Root Level

- `npm run dev` - Start desktop app in development mode
- `npm run dev:desktop` - Start desktop app with Tauri
- `npm run build` - Build all packages and desktop app
- `npm run build:desktop` - Build desktop app (includes Tauri build)
- `npm run build:packages` - Build shared packages only
- `npm run lint` - Lint all packages
- `npm run format` - Format all code with Prettier
- `npm run type-check` - Type check all packages
- `npm run clean` - Clean all build artifacts

### Desktop App Scripts

From the root directory:

- `npm run dev:desktop` - Start Tauri app in dev mode
- `npm run build:desktop` - Build production app

From `apps/desktop`:

- `npm run tauri:dev` - Start Tauri dev mode
- `npm run tauri:build` - Build native macOS app
- `npm run dev` - Start Vite dev server only (for testing)

## 🎨 Design System

The project uses a Notion-inspired design system located in `packages/ui`. The design tokens include:

- **Colors**: Background, text, borders, accents, semantic colors
- **Spacing**: 4px-based spacing scale
- **Typography**: Font families, sizes, weights, line heights
- **Sizing**: Icons, buttons, inputs, border radius, z-index
- **Interactions**: Cursor, opacity, shadows, focus states
- **Animations**: Durations, easing functions, transitions

Import tokens in your code:

```typescript
import { colors, spacing, typography } from '@clutter/ui';
```

## 🛠️ Technology Stack

### Core

- **Monorepo**: Turborepo
- **Language**: TypeScript (strict mode)
- **State Management**: Zustand
- **Routing**: React Router

### Desktop App

- **Framework**: React 18
- **Build Tool**: Vite
- **Desktop Runtime**: Tauri (Rust + WebView)
- **Editor**: TipTap (ProseMirror-based)
- **UI Components**: Custom design system

### Tooling

- **Linting**: ESLint
- **Formatting**: Prettier
- **Git Hooks**: Husky + lint-staged
- **Type Checking**: TypeScript

## 📱 Building for Production

### macOS Desktop App

```bash
cd apps/desktop
npm run tauri:build
```

Output: `apps/desktop/src-tauri/target/release/bundle/`

This creates:

- `.app` bundle for macOS
- `.dmg` installer (macOS disk image)

**Distribution:**

- Sign the app with your Apple Developer certificate
- Notarize for macOS Gatekeeper
- Distribute via direct download or Mac App Store

## 🔧 Development Workflow

1. **Make changes** in any app or package
2. **Type checking** runs automatically via Turbo
3. **Linting** runs on commit (via Husky)
4. **Formatting** runs on commit (via lint-staged)

### Working with Shared Packages

The `packages/shared` and `packages/ui` packages are automatically linked via npm workspaces. Changes to these packages will be reflected in all apps that use them.

To rebuild packages after changes:

```bash
npm run build:packages
```

Or use watch mode (in package directory):

```bash
cd packages/shared
npm run dev
```

## 📝 Environment Variables

Use `VITE_` prefix for environment variables:

```env
VITE_APP_NAME=Clutter Notes
```

Access in code:

```typescript
import.meta.env.VITE_APP_NAME;
```

**Note:** Currently, Clutter stores data locally (no backend/API).

## 🏛️ Architecture Decisions

### Why Turborepo?

- Fast builds with intelligent caching
- Easy dependency management across packages
- Parallel task execution
- Simple configuration

### Why Tauri over Electron?

- Smaller bundle size
- Better performance
- Native security model
- Rust backend for system operations

### Why Zustand?

- Minimal boilerplate
- Simple API
- Lightweight and fast
- No context providers needed

### Why Notion Design System?

- Clean, minimal aesthetic
- Excellent UX patterns
- Familiar to many users
- Well-documented interaction patterns

## 🐛 Troubleshooting

### Tauri Build Issues

If you encounter Rust compilation errors:

1. Ensure Rust is installed: `rustc --version`
2. Update Rust: `rustup update`
3. Clean build: `cd apps/desktop && rm -rf src-tauri/target`
4. Kill existing processes: `pkill -f "tauri dev"`

### Port Already in Use

If port 1420 is already in use:

```bash
lsof -ti:1420 | xargs kill -9
npm run dev:desktop
```

### TypeScript Errors

If you see type errors after adding new packages:

1. Rebuild packages: `npm run build:packages`
2. Restart TypeScript server in your IDE

### Workspace Linking Issues

If packages aren't linking correctly:

1. Clean install: `npm run clean && npm install`
2. Verify workspaces in root `package.json`

### Icon Not Updating

If app icon doesn't change after replacement:

1. Quit the app completely (Cmd+Q)
2. Rebuild: `npm run tauri:build`
3. macOS caches icons - restart may be needed

## 📚 Development Roadmap

Current status: **macOS native app with custom editor**

Potential future enhancements:

1. **Cloud Sync** - Add backend for multi-device sync
2. **iOS/iPadOS** - Tauri mobile support (when available)
3. **Windows/Linux** - Tauri already supports these platforms
4. **Plugins** - Extend editor with custom functionality
5. **Collaboration** - Real-time multi-user editing

## 📄 License

[Add your license here]

## 🤝 Contributing

[Add contributing guidelines here]
