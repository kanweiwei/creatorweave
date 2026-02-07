# Phase 4 User Guide - Workspace Management & Polish

## Quick Start

The Browser FS Analyzer now includes comprehensive workspace management features to improve your productivity and customize your experience.

---

## 🎨 Theme Support

### Switching Themes

**Method 1: Click the Theme Toggle Button**

- Located in the top-right toolbar (sun/moon/monitor icon)
- Left-click to cycle: Light → Dark → System

**Method 2: Right-Click Context Menu**

- Right-click the theme toggle button
- Select your preferred theme directly from the menu

**Method 3: Keyboard Shortcut**

- `Ctrl/Cmd + ,` opens Workspace Settings → Display tab → Select theme

### Theme Options

- **Light**: Always use light mode
- **Dark**: Always use dark mode
- **System**: Automatically match your OS preference

---

## ⌨️ Keyboard Shortcuts

### Essential Shortcuts

| Shortcut       | Action                                       |
| -------------- | -------------------------------------------- |
| `Ctrl/Cmd + K` | Open Command Palette (search for any action) |
| `Ctrl/Cmd + B` | Toggle sidebar visibility                    |
| `Ctrl/Cmd + ,` | Open workspace settings                      |
| `Ctrl/Cmd + 1` | Switch to Files tab                          |
| `Ctrl/Cmd + 2` | Switch to Plugins tab                        |
| `Ctrl/Cmd + 3` | Switch to Changes tab                        |
| `Shift + ?`    | Show keyboard shortcuts help                 |
| `Esc`          | Close panels/dialogs                         |

### Command Palette (Ctrl/Cmd + K)

The command palette is the fastest way to access any feature:

1. Press `Ctrl/Cmd + K`
2. Type what you're looking for (e.g., "new conversation", "settings")
3. Use arrow keys to navigate
4. Press `Enter` to execute

**Available Commands:**

- New Conversation
- Toggle Sidebar
- Recent Files
- Skills Manager
- Tools Panel
- Keyboard Shortcuts
- Workspace Settings

---

## 📁 Recent Files

### Viewing Recent Files

**Method 1: Command Palette**

1. Press `Ctrl/Cmd + K`
2. Type "recent files"
3. Press `Enter`

**Method 2: Workspace Settings**

1. Click the settings icon in the top-right
2. Go to the "Data" tab
3. View and manage recent files

### Features

- **Auto-tracking**: Files you open are automatically saved
- **Up to 10 files**: Keeps your most recent files
- **Relative timestamps**: See when you last accessed each file
- **Quick access**: Click any file to open it again
- **Remove files**: Click the X button to remove specific files
- **Clear all**: Remove all recent files from history

---

## ⚙️ Workspace Settings

### Accessing Settings

**Methods:**

- Click the settings (gear) icon in the top-right toolbar
- Press `Ctrl/Cmd + ,`
- Use command palette and type "settings"

### Settings Tabs

#### 📐 Layout Tab

Customize panel sizes:

- **Sidebar Width** (200-400px): Adjust the left sidebar width
- **Conversation Area** (20-80%): Control how much space the conversation takes
- **Preview Panel** (30-80%): Set the file preview panel size
- **Reset Layout**: Restore default panel sizes

#### 🎨 Display Tab

Customize visual appearance:

- **Theme**: Light / Dark / System
- **Font Size**: Small (12px) / Medium (14px) / Large (16px)
- **Line Numbers**: Show/hide line numbers in code editor
- **Word Wrap**: Enable/disable word wrapping
- **Mini Map**: Show/hide code mini-map

#### ⌨️ Shortcuts Tab

View and learn keyboard shortcuts:

- **View All Shortcuts**: Opens comprehensive shortcuts dialog
- **Categories**: Shortcuts organized by feature area
- **Search**: Find specific shortcuts quickly
- **Tips**: Pro tips for efficient workflow

#### 🗑️ Data Tab

Manage workspace data:

- **Recent Files**: View count and clear history
- **Reset All**: Reset all settings to defaults
- **Warnings**: Confirmations for destructive actions

---

## 🎯 First-Time User Tour

### Automatic Tour

When you first use the application, you'll see an onboarding tour that guides you through the main features:

1. **Welcome**: Introduction to the application
2. **Conversations**: How to chat with AI
3. **File Browser**: Navigating your project files
4. **Skills**: Managing reusable skills
5. **Tools Panel**: Accessing tools and visualizations
6. **Complete**: You're ready to go!

### Tour Features

- **Next/Previous**: Navigate at your own pace
- **Skip**: Exit the tour anytime
- **Don't Show Again**: Permanently hide the tour
- **Progress Indicator**: See how far along you are

### Re-showing the Tour

If you want to see the tour again:

1. Open workspace settings (`Ctrl/Cmd + ,`)
2. Go to the "Data" tab
3. Look for "Reset Onboarding" option (coming soon)

---

## 💡 Pro Tips

### Productivity Tips

1. **Use the Command Palette**: It's faster than clicking menus
   - `Ctrl/Cmd + K` → type action → `Enter`

2. **Customize Your Layout**: Find what works for you
   - Larger preview panel for code review
   - Wider sidebar for better file tree visibility

3. **Leverage Recent Files**: Quick access to files you're working on
   - Automatically tracks files you open
   - No need to navigate the file tree repeatedly

4. **Keyboard Shortcuts**: Learn the essentials
   - `Ctrl/Cmd + K` for command palette
   - `Ctrl/Cmd + B` to toggle sidebar
   - `Esc` to close anything

5. **Theme Selection**: Match your environment
   - Use "System" theme to match OS
   - Switch to Dark mode for reduced eye strain

### Workflow Suggestions

**For Code Review:**

- Increase preview panel to 70%
- Enable line numbers
- Use Recent Files to navigate between changed files

**For Chat-Heavy Work:**

- Increase conversation area to 60%
- Keep sidebar visible for file access
- Use command palette for quick actions

**For Exploration:**

- Use default layout (balanced)
- Toggle sidebar as needed (`Ctrl/Cmd + B`)
- Keep Recent Files handy

---

## 🐛 Troubleshooting

### Common Issues

**Theme not applying:**

- Check browser console for errors
- Try hard refresh (`Ctrl/Cmd + Shift + R`)
- Clear browser cache

**Panel sizes not saving:**

- Check localStorage is enabled
- Look for storage quota warnings
- Try resetting to defaults and reconfigure

**Keyboard shortcuts not working:**

- Make sure you're not in a text input field
- Check browser console for conflicts
- Try disabling browser extensions

**Recent files not showing:**

- Open some files in the file tree
- Check workspace settings → Data tab
- Clear browser cache and try again

---

## 📚 Additional Resources

### Documentation

- [Phase 4 Implementation Summary](./PHASE4_IMPLEMENTATION_SUMMARY.md) - Technical details
- [README.md](./README.md) - General project information

### Support

- Report issues on GitHub
- Check existing documentation
- Contact the development team

---

## 🎉 Enjoy Your Enhanced Workspace!

All Phase 4 features are designed to improve your productivity and customize your experience. Try them out and find what works best for you!

**Last Updated**: 2025-02-08
**Version**: Phase 4 Complete
