# Obsidian Folder Structure for Do Day

## Overview
Do Day stores all data in a user-selected folder with an Obsidian-compatible structure. This allows seamless integration with Obsidian for viewing and editing notes.

## Folder Hierarchy

```
📁 Do Day Vault/
├── 📁 Journal/
│   ├── 📁 Daily/
│   │   ├── 2026-04-19.md
│   │   ├── 2026-04-20.md
│   │   └── ...
│   ├── 📁 Weekly/
│   │   ├── 2026-W16.md
│   │   ├── 2026-W17.md
│   │   └── ...
│   ├── 📁 Monthly/
│   │   ├── 2026-04.md
│   │   ├── 2026-05.md
│   │   └── ...
│   └── 📁 Yearly/
│       ├── 2026.md
│       └── ...
├── 📁 Habits/
│   └── (Habit tracking files)
├── 📁 Events/
│   └── (Calendar events)
└── 📁 Reminders/
    └── (Reminders/tasks)
```

## File Format

All journal entries use Markdown format with YAML frontmatter for Obsidian compatibility:

### Daily Entry Example (2026-04-19.md)
```markdown
---
date: 2026-04-19
scope: heute
tags: []
---

Heutiger Journal-Eintrag...
Aufgaben, Notizen, Gedanken...
```

### Weekly Entry Example (2026-W16.md)
```markdown
---
date: 2026-04-19
scope: woche
tags: []
---

Wochenplanung KW 16...
```

### Monthly Entry Example (2026-04.md)
```markdown
---
date: 2026-04-01
scope: monat/jahr
tags: []
---

Monatsübersicht April 2026...
```

## Synchronization

- **Local Storage**: Files are stored in the user-selected folder
- **iCloud Sync**: The folder path is synced across devices via iCloud Key-Value Storage
- **Obsidian**: The folder can be opened as an Obsidian vault for advanced editing
- **Nextcloud/WebDAV**: Future support for cloud synchronization

## Naming Conventions

| Scope | Format | Example | Folder |
|-------|--------|---------|--------|
| Today/Tomorrow | `YYYY-MM-DD.md` | `2026-04-19.md` | `Journal/Daily/` |
| Week | `YYYY-Www.md` | `2026-W16.md` | `Journal/Weekly/` |
| Month | `YYYY-MM.md` | `2026-04.md` | `Journal/Monthly/` |
| Year | `YYYY.md` | `2026.md` | `Journal/Yearly/` |

## Benefits

1. **Obsidian Compatible**: Open the folder as an Obsidian vault
2. **Human Readable**: Plain text Markdown files
3. **Version Control Friendly**: Works with Git
4. **Future Proof**: Standard format, no vendor lock-in
5. **Cross-Platform**: Works on iOS, macOS, and via Obsidian on desktop
6. **Search Friendly**: Easy to search with Spotlight, Obsidian, or grep

## Migration

If you want to use an existing Obsidian vault:
1. Select your existing Obsidian vault folder when prompted
2. Do Day will create the necessary subfolders
3. Existing notes remain untouched
4. Do Day entries will appear in the Journal subfolder
