# ⚡️ Quick Fix: Schriftgrößen & Duplicate File

## Problem

```
error: Invalid redeclaration of 'KeyboardHomebarView'
error: Ambiguous use of 'init(selectedScope:)'
```

## Ursache

1. **Zwei Dateien mit gleicher Struct:**
   - `KeyboardHomebarView.swift` (alt)
   - `ViewsKeyboardHomebarView.swift` (neu)

2. **Unterschiedliche Schriftgrößen:**
   - "DO" / "DAY": 13pt
   - "DO" / "MORROW": 12pt / 11pt ❌ (ungleichmäßig)

---

## ✅ Lösung

### 1. Alte Datei entfernt
- `KeyboardHomebarView.swift` → Placeholder (kann aus Xcode gelöscht werden)
- **Aktive Datei:** `ViewsKeyboardHomebarView.swift`

### 2. Einheitliche Schriftgrößen

**Vorher:**
```swift
// DO DAY
Text("DO").font(.system(size: 13, ...))
Text("DAY").font(.system(size: 13, ...))

// DO MORROW
Text("DO").font(.system(size: 12, ...))
Text("MORROW").font(.system(size: 11, ...))  ❌ Ungleich!
```

**Jetzt:**
```swift
// Alle Buttons: 12pt
Text("DO").font(.system(size: 12, weight: .medium, design: .rounded))
Text("DAY").font(.system(size: 12, weight: .medium, design: .rounded))
Text("MORROW").font(.system(size: 12, weight: .medium, design: .rounded))
    .tracking(-0.5)  // Leicht enger für "MORROW"
```

---

## 🎨 Neue Typography

### Alle Buttons: 12pt
- **DO:** 12pt
- **DAY:** 12pt
- **MORROW:** 12pt + `-0.5pt` tracking
- **WEEK:** 12pt
- **MON / YEAR:** 12pt

### Spacing:
- **DO DAY:** `spacing: 1` (zwischen Zeilen)
- **DO MORROW:** `spacing: 0` (kompakter, weil "MORROW" länger ist)
- **Tracking für MORROW:** `-0.5pt` (leicht enger)

---

## 📐 Warum 12pt?

| Größe | Vorteil | Nachteil |
|---|---|---|
| **13pt** | Gut lesbar | "MORROW" zu groß |
| **12pt** ✅ | Einheitlich, passt perfekt | — |
| **11pt** | Mehr Platz | Zu klein für Touch |

**Entscheidung:** 12pt für **alle** Texte, mit `-0.5pt tracking` für "MORROW".

---

## 🚀 Wie weiter?

### In Xcode:
1. **Öffne:** Project Navigator (⌘1)
2. **Finde:** `KeyboardHomebarView.swift`
3. **Rechtsklick:** "Delete" → "Move to Trash"
4. **Behalte:** `ViewsKeyboardHomebarView.swift`

### Dann:
1. **Clean Build:** ⇧⌘K
2. **Build:** ⌘B
3. **Run:** ⌘R

---

## ✅ Ergebnis

```
┌────────────────────┬─────────┬─────────┐
│   DO    │    DO    │         │   MON   │
│  DAY    │  MORROW  │  WEEK   │  YEAR   │  ← Alles 12pt!
└────────────────────┴─────────┴─────────┘
```

- ✅ Einheitliche Schriftgröße (12pt)
- ✅ "MORROW" passt durch `-0.5pt tracking`
- ✅ Keine Duplicate-Errors mehr
- ✅ Cleaner Code

---

**Erstellt am:** 19. April 2026, 15:17 Uhr  
**Fix-Version:** 3.1
