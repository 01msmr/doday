# Obsidian Folder Structure for Do Day

## Overview
Do Day stores all data in a user-selected folder with a simple, flat Obsidian-compatible structure.

## Folder Hierarchy

```
📁 Do Day Vault/
├── 📁 Daily/
│   ├── 2026-04-19.md
│   ├── 2026-04-20.md
│   └── ...
└── 📁 Weekly/
    ├── 2026-W16.md
    ├── 2026-W17.md
    └── ...
```

## File Format

All entries use Markdown format with YAML frontmatter for Obsidian compatibility:

### Daily Entry Example (2026-04-19.md)
```markdown
---
date: 2026-04-19
tags: []
---

# Termine
- 14:00 Arzttermin

# Aufgaben
- [ ] Einkaufen
- [x] Email beantworten

# Habits
- [x] Sport
- [ ] Lesen

# Notizen
Heutiger Journal-Eintrag...
```

### Weekly Entry Example (2026-W16.md)
```markdown
---
date: 2026-04-19
week: 16
tags: []
---

# Wochenplanung KW 16

## Ziele
- Projekt X abschließen

## Notizen
Wochenübersicht...
```

## Synchronization

- **Local Storage**: Files are stored in the user-selected folder
- **iCloud Sync**: The folder path is synced across devices via iCloud Key-Value Storage
- **Obsidian**: The folder can be opened as an Obsidian vault

## Naming Conventions

| Scope | Format | Example | Folder |
|-------|--------|---------|--------|
| Today/Tomorrow | `YYYY-MM-DD.md` | `2026-04-19.md` | `Daily/` |
| Week | `YYYY-Www.md` | `2026-W16.md` | `Weekly/` |

## Benefits

1. **Simple & Flat**: Easy to navigate
2. **Obsidian Compatible**: Open the folder as an Obsidian vault
3. **Human Readable**: Plain text Markdown files
4. **All-in-One**: Each file contains termine, aufgaben, habits, and notes
5. **Future Proof**: Standard format, no vendor lock-in

