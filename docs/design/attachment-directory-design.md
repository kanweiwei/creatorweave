# Attachment Directory Design

## Overview

A workspace-level attachment directory that allows users to upload files during conversations. The Agent accesses attachments through the existing `read`/`ls` tools via the `vfs://attachments/` VFS path.

## Architecture

```
User Upload → OPFS .attachments/ directory → vfs://attachments/ path → Existing read/ls tools
```

### Storage

- **Location**: OPFS workspace root `.attachments/` directory
- **Shared**: All conversations in the same workspace share the same attachment directory
- **Path convention**: `vfs://attachments/filename.ext` maps to `.attachments/filename.ext` in OPFS workspace

### VFS Integration

The `vfs://attachments/` namespace is resolved by the VFS resolver as a workspace path prefix:

```
vfs://attachments/report.pdf  →  workspace path: .attachments/report.pdf
vfs://attachments/data/       →  workspace path: .attachments/data/
```

No new tools are needed. The existing tools work automatically:
- `ls vfs://attachments/` — list all attachments
- `read vfs://attachments/filename` — read attachment content

### Message Extension

The `Message` type gains an optional `attachments` field:

```ts
interface AttachmentMeta {
  id: string
  name: string        // original filename
  size: number        // bytes
  mimeType: string    // MIME type
  uploadedAt: number  // upload timestamp
}

// Added to Message interface:
attachments?: AttachmentMeta[]
```

This metadata is stored in SQLite with the message but the actual file content lives in OPFS.

## Data Flow

### Upload Flow

```
1. User clicks attachment button (📎) in input area
2. Browser file picker opens
3. Selected files stored as pending in attachment.store
4. Preview bar shows pending attachments above input
5. On send:
   a. Files written to OPFS .attachments/ via attachment.service
   b. createUserMessage(text, attachments) includes metadata
   c. Pending attachments cleared
   d. Agent receives message with attachment context in system prompt
```

### Agent Access Flow

```
1. System prompt informs Agent about vfs://attachments/
2. Agent calls: ls vfs://attachments/
3. VFS resolver maps to .attachments/ workspace path
4. Agent calls: read vfs://attachments/report.pdf
5. Existing read tool reads file from OPFS
6. Agent analyzes content and responds to user
```

## Components

### New Files

| File | Purpose |
|------|---------|
| `web/src/types/attachment.ts` | AttachmentMeta type definition |
| `web/src/services/attachment.service.ts` | OPFS upload/delete operations |
| `web/src/store/attachment.store.ts` | Pending attachments UI state |

### Modified Files

| File | Change |
|------|--------|
| `web/src/agent/tools/vfs-resolver.ts` | Add `attachments` namespace → `.attachments/` prefix |
| `web/src/agent/message-types.ts` | Add `attachments` field to Message |
| `web/src/agent/prompts/universal-system-prompt.ts` | Add attachment path documentation |
| `web/src/components/agent/ConversationView.tsx` | Upload button + preview bar + send integration |
| `web/src/components/agent/MessageBubble.tsx` | Render attachments in user messages |

## VFS Resolver Change

In `parseVfsPath` (`web/src/agent/tools/vfs-resolver.ts`), add before the unsupported namespace error:

```ts
if (namespace === 'attachments' || namespace === 'attachment') {
  const attachmentPath = parts.slice(1).join('/')
  return {
    namespace: 'workspace',
    path: '.attachments/' + normalizeRelativePath(attachmentPath, { allowEmpty: allowEmptyPath }),
  }
}
```

This maps `vfs://attachments/xxx` to workspace path `.attachments/xxx` with zero changes to existing tools.

## Attachment Service

```ts
// web/src/services/attachment.service.ts

import { useOPFSStore } from '@/store/opfs.store'
import { generateId } from '@/opfs'

export const attachmentService = {
  async upload(workspaceId: string | null, file: File): Promise<AttachmentMeta> {
    const { writeFile } = useOPFSStore.getState()
    const path = `.attachments/${file.name}`

    const content = file.type.startsWith('text/')
      ? await file.text()
      : await file.arrayBuffer()

    await writeFile(path, content, null, workspaceId)

    return {
      id: generateId('att'),
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      uploadedAt: Date.now(),
    }
  },

  async delete(workspaceId: string | null, filename: string): Promise<void> {
    const { deleteFile } = useOPFSStore.getState()
    await deleteFile(`.attachments/${filename}`, null, workspaceId)
  },
}
```

## UI Design

### Input Area

```
┌─────────────────────────────────────────┐
│ 📎 report.pdf (2.3MB) ✕  data.csv (156B) ✕ │  ← Preview bar (conditional)
├─────────────────────────────────────────┤
│ Type a message...              [📎] [➤] │  ← Paperclip button added
└─────────────────────────────────────────┘
```

### Message Bubble

```
┌──────────────────────────────────┐
│ User                             │
│                                  │
│ Analyze these files for me       │
│                                  │
│ 📎 report.pdf (2.3MB)           │
│ 📊 data.csv (156B)              │
└──────────────────────────────────┘
```

## System Prompt Addition

```
## Attachments

Users can upload files as attachments during conversations. Attachments are stored in the
workspace at vfs://attachments/. Use these commands to access them:

- ls vfs://attachments/ — list all uploaded attachments
- read vfs://attachments/<filename> — read an attachment file

When a user mentions uploaded files or asks to analyze attachments, use the above paths
to access the files.
```

## Cleanup Strategy

- Attachments are workspace-level and persist across conversations
- Deleting a conversation does NOT delete attachments
- Users can manage attachments through the file tree (`.attachments/` is visible)
- Future: Add an attachment management panel in settings

## Future Considerations

- **Drag & Drop**: Enhance existing `DropZone.tsx` to save to `.attachments/` instead of generating text prompts
- **Image Preview**: For image attachments, render inline thumbnails in message bubbles
- **Size Limits**: Add upload size validation (e.g., 50MB per file)
- **Attachment Count**: Limit pending attachments per message (e.g., max 10)
