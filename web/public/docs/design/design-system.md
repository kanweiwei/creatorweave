# BFOSA Design System

## 概述 / Overview

**名称**: Vibrant Editorial Fusion — Teal Cyan
**版本**: 1.0
**主题**: Light / Dark 双主题支持

设计系统为 BFOSA (Browser File System Analyzer) 应用提供统一的视觉语言和组件规范。

---

## 颜色系统 / Color System

### 语义化颜色 / Semantic Colors

#### 背景色 / Background Colors

| 变量名 | Light Theme | Dark Theme | 用途 |
|--------|-------------|------------|------|
| `$bg-primary` | `#FFFFFF` | `#0A0A0A` | 主背景，页面基础色 |
| `$bg-secondary` | `#F5F5F5` | `#171717` | 次级背景，卡片/面板 |
| `$bg-tertiary` | `#FAFAFA` | `#1A1A1A` | 三级背景，嵌套区域 |
| `$bg-hover` | `#F0F0F0` | `#252525` | 悬停状态 |
| `$bg-elevated` | `#FFFFFF` | `#1F1F1F` | 浮层元素背景 |

#### 文字色 / Text Colors

| 变量名 | Light Theme | Dark Theme | 用途 |
|--------|-------------|------------|------|
| `$text-primary` | `#171717` | `#E5E5E5` | 主要文字，标题 |
| `$text-secondary` | `#525252` | `#A3A3A3` | 次要文字，正文 |
| `$text-tertiary` | `#737373` | `#737373` | 辅助文字，说明 |
| `$text-muted` | `#A3A3A3` | `#525252` | 禁用/占位文字 |
| `$text-on-primary` | `#FFFFFF` | `#FFFFFF` | 主色上的文字 |

#### 主题色 / Primary Colors (Teal)

| 变量名 | Light Theme | Dark Theme | 用途 |
|--------|-------------|------------|------|
| `$primary-50` | `#F0FDFA` | `#042F2E` | 主色浅背景 |
| `$primary-100` | `#CCFBF1` | `#134E4A` | 主色背景 |
| `$primary-500` | `#14B8A6` | `#14B8A6` | 主色默认 |
| `$primary-600` | `#0D9488` | `#2DD4BF` | 主色主要状态 |
| `$primary-700` | `#0F766E` | `#5EEAD4` | 主色深色文字 |

#### 状态色 / Status Colors

| 变量名 | Light Theme | Dark Theme | 用途 |
|--------|-------------|------------|------|
| **Success** | | | |
| `$success` | `#16A34A` | `#22C55E` | 成功状态 |
| `$success-bg` | `#DCFCE7` | `#052E16` | 成功背景 |
| `$success-text` | `#15803D` | `#4ADE80` | 成功文字 |
| **Warning** | | | |
| `$warning` | `#D97706` | `#FBBF24` | 警告状态 |
| `$warning-bg` | `#FEF3C7` | `#451A03` | 警告背景 |
| **Danger** | | | |
| `$danger` | `#E07B54` | `#F59E6B` | 危险/错误状态 |
| `$danger-bg` | `#FFF7ED` | `#431407` | 危险背景 |
| `$danger-border` | `#FDBA74` | `#C2410C` | 危险边框 |

#### 边框色 / Border Colors

| 变量名 | Light Theme | Dark Theme | 用途 |
|--------|-------------|------------|------|
| `$border-default` | `#E5E5E5` | `#262626` | 默认边框 |
| `$border-subtle` | `#F0F0F0` | `#1F1F1F` | 微妙边框 |
| `$border-strong` | `#D4D4D4` | `#404040` | 强调边框 |

#### 中性色阶 / Neutral Scale (Gray)

| 变量 | Light | Dark |
|------|-------|------|
| `$gray-50` | `#F9FAFB` | `#111827` |
| `$gray-100` | `#F3F4F6` | `#1F2937` |
| `$gray-200` | `#E5E7EB` | `#374151` |
| `$gray-400` | `#9CA3AF` | `#6B7280` |
| `$gray-700` | `#374151` | `#D1D5DB` |

---

## 字体系统 / Typography

### 字体家族 / Font Families

| 变量 | 值 | 用途 |
|------|-----|------|
| `$font-primary` | `Inter` | 默认字体 |
| `$font-family` | `Inter` | 字体家族 |

### 字体层级 / Type Scale

| 层级 | 字体 | 大小 | 字重 | 行高 | 用途 |
|------|------|------|------|------|------|
| Display | Newsreader | 28px | Medium (500) | - | 页面标题 |
| Heading | Newsreader | 20px | Medium (500) | - | 区块标题 |
| Subheading | Newsreader | 16px | Medium (500) | - | 子标题 |
| Body | Inter | 14px | Regular (400) | - | 正文 |
| Data | JetBrains Mono | 13px | Semibold (600) | - | 数据/代码 |
| Label | JetBrains Mono | 10px | Semibold (600) | - | 标签/说明 |

### 字体示例 / Typography Samples

```
Display: Newsreader 28px Medium
The quick brown fox

Heading: Newsreader 20px Medium
The quick brown fox

Subheading: Newsreader 16px Medium
The quick brown fox

Body: Inter 14px Regular
The quick brown fox jumps over the lazy dog

Data: JetBrains Mono 13px Semibold
2.1 MB / 555.8 GB

Label: JetBrains Mono 10px Semibold / LS 1.5
STORAGE (BROWSER QUOTA)
```

---

## 间距系统 / Spacing System

### 间距刻度 / Spacing Scale

| 值 | 用途 |
|----|------|
| 4px | 最小间距，元素内紧凑布局 |
| 8px | 小间距，按钮内边距 |
| 12px | 中等间距，列表项间距 |
| 16px | 标准间距，区块内元素 |
| 24px | 大间距，组件之间 |
| 32px | 页面内边距 |

### 组件间距建议 / Component Spacing Guidelines

- **卡片内部**: gap: 12-16px, padding: 20-24px
- **按钮**: padding: [10, 16] ~ [10, 20]
- **输入框**: padding: [10, 12]
- **徽章**: padding: [4, 10]
- **面板**: padding: 20-24px

---

## 圆角系统 / Border Radius

| 值 | 用途 |
|----|------|
| 0px | 直角边缘 |
| 6px | 小圆角 - 徽章、复选框 |
| 8px | 中圆角 - 按钮、输入框 |
| 16px | 大圆角 - 面板、卡片 |
| 9999px | 完全圆角 - 胶囊、头像 |

---

## 阴影 / Shadow

| 变量 | Light Theme | Dark Theme | 用途 |
|------|-------------|------------|------|
| `$shadow-color` | `#00000012` | `#00000040` | 阴影颜色基础 |

### 卡片阴影组合 / Card Shadow

```
effect:
  - blur: 16, color: $shadow-color, offset: {x: 0, y: 4}
  - blur: 4, color: $shadow-color, offset: {x: 0, y: 1}
```

---

## 组件规范 / Component Specifications

### 按钮 / Buttons

#### Primary Button

```
fill: $primary-600
padding: [10, 20]
cornerRadius: 8
gap: 8
text: $text-on-primary, Inter 13px Semibold
```

#### Secondary Button

```
fill: $primary-50
stroke: $primary-600, thickness: 1
padding: [10, 20]
cornerRadius: 8
gap: 8
text: $primary-600, Inter 13px Semibold
```

#### Outline Button

```
fill: transparent
stroke: $border-default, thickness: 1
padding: [10, 20]
cornerRadius: 8
gap: 8
text: $text-primary, Inter 13px Semibold
```

#### Ghost Button

```
fill: transparent
padding: [10, 16]
cornerRadius: 8
gap: 6
text: $text-secondary, Inter 13px Medium
```

#### Icon Button

```
fill: transparent / $hover states
width: 32, height: 32
cornerRadius: 6
```

### 徽章 / Badges

#### Success Badge

```
fill: $success-bg
padding: [4, 10]
cornerRadius: 6
text: $success, JetBrains Mono 11px Semibold
```

#### Warning Badge

```
fill: $warning-bg
padding: [4, 10]
cornerRadius: 6
text: $warning, JetBrains Mono 11px Semibold
```

#### Error Badge

```
fill: $danger-bg
padding: [4, 10]
cornerRadius: 6
text: $danger, JetBrains Mono 11px Semibold
```

#### Neutral Badge

```
fill: $gray-100 (light) / $gray-800 (dark)
padding: [4, 10]
cornerRadius: 6
text: $text-tertiary, JetBrains Mono 11px Semibold
```

### 标签 / Tags

```
padding: [6, 14]
cornerRadius: 20
stroke: matching color, thickness: 1
text: Inter 12px Medium
```

### 卡片 / Cards

#### Metric Card

```
fill: $bg-primary
stroke: $gray-200, thickness: 1
cornerRadius: 16
padding: 24
gap: 12
shadow: card-shadow
```

**内容结构**:
- 标签: `$text-tertiary`, JetBrains Mono 10px
- 数值: `$text-primary`, Newsreader 36px Medium
- 变化指示: `$success` / `$danger`, Inter 12px

#### Content Card

```
fill: $bg-primary
stroke: $gray-200, thickness: 1
cornerRadius: 16
clip: true
```

**内容结构**:
- 图片区域: fill: $primary-50, height: 160
- 主体: padding: 20, gap: 8
- 页脚: padding: [12, 20], border-top: $gray-200

### 进度条 / Progress Bars

```
height: 6
cornerRadius: 3
fill: $gray-200
progress-fill: gradient($primary-500 → $primary-600)
```

### 输入框 / Input Fields

```
height: 40
cornerRadius: 8
stroke: $gray-200, thickness: 1
padding: [0, 12]
text: Inter 14px
label: $text-primary, Inter 13px Medium
```

### 模态框 / Modals

```
fill: $bg-primary
cornerRadius: 12
shadow: modal-shadow
header: padding: [0, 24], height: 56
body: padding: 24
```

---

## 变量完整列表 / Variable Reference

### 颜色变量 / Color Variables

```
# Primary (Teal)
$primary-50, $primary-100, $primary-500, $primary-600, $primary-700

# Gray Scale
$gray-50, $gray-100, $gray-200, $gray-400, $gray-700

# Blue
$blue-50, $blue-200, $blue-500, $blue-700

# Green
$green-50, $green-200, $green-400, $green-500, $green-700

# Yellow/Amber
$yellow-50, $yellow-200, $yellow-400, $yellow-700
$amber-50, $amber-200, $amber-300, $amber-500, $amber-600

# Orange
$orange-50, $orange-200, $orange-700

# Red
$red-50, $red-200, $red-500, $red-700

# Purple
$purple-50, $purple-200, $purple-700

# Pink
$pink-50, $pink-200, $pink-700

# Indigo
$indigo-50, $indigo-200, $indigo-700

# Neutral
$neutral-50 ~ $neutral-900

# Semantic
$bg-primary, $bg-secondary, $bg-tertiary, $bg-hover, $bg-elevated
$text-primary, $text-secondary, $text-tertiary, $text-muted, $text-on-primary
$border-default, $border-subtle, $border-strong
$success, $success-bg, $success-text
$warning, $warning-bg
$danger, $danger-bg, $danger-border
$secondary-bg, $secondary-text
```

### 数值变量 / Numeric Variables

```
$radius-lg: 8
$radius-full: 9999
```

---

## 主题切换 / Theme Switching

### Light Theme 默认值

```css
--bg-primary: #FFFFFF;
--bg-secondary: #F5F5F5;
--text-primary: #171717;
--text-secondary: #525252;
--border-default: #E5E5E5;
--primary-600: #0D9488;
```

### Dark Theme 默认值

```css
--bg-primary: #0D1117;    /* GitHub dark style - warm, not pure black */
--bg-secondary: #131920;
--text-primary: #E8ECEF;   /* Warm white, not pure white */
--text-secondary: #A3A9AE;
--border-default: #1E2A32; /* Subtle teal tint */
--primary-600: #2DD4BF;
```

---

## 使用指南 / Usage Guidelines

### 1. 颜色使用优先级

1. **优先使用语义化变量** (`$success`, `$warning`, `$danger`)
2. **其次使用主题色** (`$primary-600`, `$primary-50`)
3. **最后使用中性色** (`$gray-200`, `$text-secondary`)

### 2. 间距使用规则

- 组件内部 gap: 4, 8, 12
- 组件之间 gap: 16, 24
- 区块之间 gap: 32, 48

### 3. 字体使用规则

- **标题**: Newsreader, Medium
- **正文**: Inter, Regular
- **数据/代码**: JetBrains Mono, Semibold
- **标签/说明**: JetBrains Mono, Semibold, letterSpacing: 1.5

### 4. 圆角使用规则

- **徽章/标签**: 6px
- **按钮/输入**: 8px
- **卡片/面板**: 16px
- **头像/胶囊**: full (9999px)

---

## 组件库位置 / Component Library Location

设计文件: `bfosa.pen`

### 主要框架 / Main Frames

| 名称 | 位置 | 内容 |
|------|------|------|
| Design Spec — Light Theme | x: 0, y: 100 | 浅色主题规范 |
| Design Spec — Dark Theme | x: 1300, y: 100 | 深色主题规范 |
| Component Library — Light | x: 2600, y: 100 | 浅色组件库 |
| Component Library — Dark | x: 3900, y: 100 | 深色组件库 |

---

*最后更新: 2025-02-03*
