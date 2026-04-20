# Workspace Single Conversation Markdown Export Design

## 1. Background
Current workspace has no direct way to export one conversation transcript for external LLM analysis (Codex, etc.). Existing `ExportPanel` is generic data export and currently has no active invocation for conversation transcript export.

## 2. Goals
1. Export exactly one conversation (workspace session) as Markdown.
2. Output is optimized for LLM ingestion (stable structure, low noise, explicit roles/timestamps).
3. Default excludes reasoning (`assistant.reasoning`), with explicit opt-in.
4. Export action is easy to discover and fast to execute.

## 3. Non-Goals
1. No zip packaging.
2. No cross-conversation batch export in this iteration.
3. No PDF/CSV/Excel conversation transcript formats in this iteration.
4. No server-side export; browser local download only.

## 4. User Stories
1. As an analyst, I can export the active conversation to `.md` and feed it directly to Codex.
2. As an advanced user, I can include reasoning blocks when needed.
3. As a user, I can export from both UI and command palette.

## 5. UX Design

### 5.1 Entry Points
1. Sidebar conversation item context action: `Export Markdown` (via DropdownMenu).
2. Command Palette command: `Export Active Conversation as Markdown`.
3. Command Palette command: `Export Active Conversation as Markdown (Include Reasoning)`.

### 5.2 Export Dialog

Uses `BrandDialog` (from `@creatorweave/ui`, same pattern as Sidebar's "Clear Workspace" confirm).

**Dialog layout:**
```
+--------------------------------------------------+
|  Export Conversation                          [X] |
+--------------------------------------------------+
|                                                   |
|  "My Project Chat"                                |
|  12 messages · Created 2026-04-20                 |
|                                                   |
|  ── Options ───────────────────────────────────── |
|                                                   |
|  [x] Include reasoning (chain-of-thought)         |
|                                                   |
|  Tool output handling:                            |
|  (•) Full output    ( ) Truncate (>10KB)          |
|                                                   |
|  ── Preview ───────────────────────────────────── |
|                                                   |
|  First 3 messages shown as markdown preview       |
|  (scrollable, read-only, ~150px height)           |
|                                                   |
+--------------------------------------------------+
|                        [Cancel]  [Export .md]     |
+--------------------------------------------------+
```

**Components:**
- Container: `BrandDialog` + `BrandDialogContent` + `BrandDialogHeader` + `BrandDialogBody` + `BrandDialogFooter`
- Title: `BrandDialogTitle` — "Export Conversation"
- Conversation info: title + message count + created date (read-only)
- Include reasoning: `Checkbox` (from `@creatorweave/ui`) — default unchecked
- Tool output: radio group — `RadioGroup` + `RadioGroupItem` (from `@creatorweave/ui`)
  - **Full output**: preserves all tool call arguments and results verbatim
  - **Truncate (>10KB)**: tool results exceeding 10KB are truncated with `[truncated, original size: N bytes]`
- Preview: `<pre>` block with first 3 messages rendered as markdown, scrollable, `max-height: 150px`
- Footer: `Button` (cancel, variant="ghost") + `Button` (export, variant="default")

**Skip dialog conditions:**
- Command palette "Default variant" → skips dialog, exports with reasoning off + full output
- Command palette "Include-reasoning variant" → skips dialog, exports with reasoning on + full output

### 5.3 Sidebar DropdownMenu Integration

Replace the current inline delete button on each conversation item with a `DropdownMenu`:

```
[Conversation Title]                    [⋮]
                                          ├─ Export Markdown...
                                          ├─ Rename
                                          └─ Delete
```

- `DropdownMenuTrigger`: `⋮` icon button (MoreVertical from lucide-react), visible on hover (`opacity-0 group-hover:opacity-100`)
- `DropdownMenuContent`: align="end", side="right"
- `DropdownMenuItem` "Export Markdown..." → opens export dialog
- `DropdownMenuItem` "Rename" → inline rename (future)
- `DropdownMenuItem` "Delete" → delete with confirmation (migrated from current inline button)

**Component:** `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator` from `@creatorweave/ui`

### 5.4 Guard States
1. No active conversation: show toast `No active conversation to export` (sonner `toast.warning`)
2. Active run in progress (`isConversationRunning(id)` from `useConversationStore`): show toast `Stop the current run before export`
3. Empty message list: still export metadata + empty transcript section

## 6. Markdown Output Contract

### 6.1 File Naming
`conversation-<sanitized-title>-<yyyyMMdd-HHmmss>.md`

Sanitization rules:
1. Lowercase the title
2. Replace spaces with hyphens
3. Remove characters not in `[a-z0-9-]`
4. Collapse consecutive hyphens
5. Strip leading/trailing hyphens
6. Truncate to 60 chars max
7. Fallback to `conversation` if result is empty

### 6.2 Document Skeleton
```markdown
# Conversation Export

- Conversation ID: <id>
- Title: <title>
- Created At: <ISO>
- Updated At: <ISO>
- Message Count: <n>
- Exported At: <ISO>
- Include Reasoning: <true|false>
- Tool Output: <full|truncated>
- Export Version: 1

## Transcript

### 1. USER
- Timestamp: <ISO>

<content>

### 2. ASSISTANT
- Timestamp: <ISO>

<content>

#### Reasoning
<reasoning content, only when includeReasoning=true>

#### Tool Calls
- <tool-name>
```json
{...arguments...}
```

### 3. TOOL
- Timestamp: <ISO>
- Tool Name: <name>
- Tool Call ID: <id>

```text
<tool-result>
```
```

### 6.3 Field Rules
1. Keep original message ordering.
2. `content` is rendered verbatim in fenced blocks when multiline; inline otherwise.
3. Tool call arguments are pretty-printed JSON when parseable; raw text fallback otherwise.
4. Assistant reasoning is included only when option is enabled.
5. Null/empty contents are rendered as `(empty)`.
6. **Images/binary content**: base64 data URLs and binary content in tool results are replaced with `[image: description]` or `[binary: filename, size]` placeholder. Detection rule: if content contains `data:image/` or tool result has `kind: 'binary_base64'`, extract filename and size metadata and render placeholder only.
7. **Tool output truncation** (when truncate option enabled): tool result content exceeding 10,240 chars is truncated with `[truncated, original size: N bytes]` suffix.

## 7. Technical Design

### 7.1 New Module
Create `web/src/services/conversation-markdown-exporter.ts`:

```ts
interface ConversationMarkdownExportOptions {
  includeReasoning?: boolean       // default false
  truncateToolOutput?: boolean     // default false
  truncateThreshold?: number       // default 10240 (chars)
  addTimestampToFilename?: boolean // default true
}

// Build markdown string from a StoredConversation
function buildConversationMarkdown(
  conversation: StoredConversation,
  options?: ConversationMarkdownExportOptions
): string

// Build a preview string (first N messages) for the dialog
function buildConversationMarkdownPreview(
  conversation: StoredConversation,
  options?: ConversationMarkdownExportOptions & { previewMessageCount?: number }
): string

// Trigger browser download
function exportConversationMarkdown(
  conversation: StoredConversation,
  options?: ConversationMarkdownExportOptions
): Promise<{ success: boolean; filename: string; size: number }>

// Sanitize title for filename
function sanitizeFilename(title: string): string

// Build export filename
function buildConversationExportFilename(title: string, now?: Date): string
```

### 7.2 Data Source
Fetch conversation from SQLite repository by ID:

```ts
import { getConversationRepository } from '@/sqlite'
const conversation = await getConversationRepository().findById(conversationId)
```

Uses `StoredConversation` type (`{ id, title, titleMode, messages, lastContextWindowUsage, createdAt, updatedAt }`) from `@/sqlite/repositories/conversation.repository`.

**Why repository over store:** Repository provides a clean, read-only snapshot without runtime state noise (streaming buffers, agent loops, etc.). The store's `Conversation` type contains many transient fields irrelevant to export.

### 7.3 UI Components

**New components:**
1. `web/src/components/export/ConversationExportDialog.tsx`
   - Props: `{ conversationId: string; open: boolean; onOpenChange: (open: boolean) => void }`
   - Uses `BrandDialog` family from `@creatorweave/ui`
   - Checkbox, RadioGroup from `@creatorweave/ui`
   - Loads conversation via `getConversationRepository().findById(conversationId)`
   - Calls `exportConversationMarkdown()` on confirm
   - Shows toast on success/error

2. **Modify** `web/src/components/layout/Sidebar.tsx`
   - Replace inline delete button with `DropdownMenu` on each conversation item
   - Add "Export Markdown..." menu item → opens `ConversationExportDialog`
   - State: `exportDialogConversationId: string | null` — tracks which conversation to export

3. **Modify** `web/src/components/workspace/command-palette-commands.tsx`
   - Add two commands in `buildEnhancedCommands()`:
     - `{ id: 'export-conversation-markdown', label: 'Export Active Conversation as Markdown', handler: ... }`
     - `{ id: 'export-conversation-markdown-with-reasoning', label: '... (Include Reasoning)', handler: ... }`
   - Both commands call `exportConversationMarkdown()` directly (skip dialog)

### 7.4 i18n
Add keys for:
1. Export action labels.
2. Guard/error toasts.
3. Include reasoning toggle label.
4. Export success message.

## 8. Error Handling
1. File save failure => toast with error message (sonner `toast.error`).
2. Unexpected serialization failure => fallback section with raw JSON snapshot for problematic message.
3. Conversation not found by ID => toast `Conversation not found`.

## 9. Testing Strategy

### 9.1 Unit Tests
`conversation-markdown-exporter.test.ts`
1. Basic conversation serialization.
2. Tool call argument parse success/fallback.
3. Reasoning include/exclude switch.
4. Empty content and null handling.
5. Filename sanitization and timestamp format.
6. Image/binary base64 detection and placeholder replacement.
7. Tool output truncation at threshold.

### 9.2 Component/Integration Tests
1. Sidebar dropdown menu opens export dialog for selected conversation.
2. Command palette exports active conversation without dialog.
3. Guard toast when conversation is running.
4. Preview section renders first 3 messages.

## 10. Rollout Plan
1. Implement `conversation-markdown-exporter.ts` + unit tests.
2. Implement `ConversationExportDialog` component.
3. Modify `Sidebar.tsx` — add DropdownMenu + wire export dialog.
4. Add command palette commands.
5. Add i18n keys.
6. Verify with a real long conversation and Codex ingestion.

## 11. Acceptance Criteria
1. User can export a single conversation as `.md` from UI in <= 2 clicks.
2. Exported markdown can be directly pasted into Codex with clear role/tool chronology.
3. Default output excludes reasoning; optional inclusion works.
4. Images and binary content are replaced with text placeholders (no base64 in output).
5. Tool output truncation option works correctly.
6. No regression to existing generic export panel.

## 12. Key Dependencies

| Dependency | Import Path | Usage |
|---|---|---|
| `BrandDialog` family | `@creatorweave/ui` | Export dialog container |
| `Checkbox` | `@creatorweave/ui` | Include reasoning toggle |
| `RadioGroup` | `@creatorweave/ui` | Tool output handling |
| `DropdownMenu` family | `@creatorweave/ui` | Sidebar conversation actions |
| `getConversationRepository` | `@/sqlite` | Fetch conversation by ID |
| `StoredConversation` type | `@/sqlite/repositories/conversation.repository` | Data type for export |
| `toast` | `sonner` | Success/error notifications |
| `Button` | `@creatorweave/ui` | Dialog actions |
