# 📱 Neues Layout-Design für Do Day

## ✨ Übersicht

Das Layout wurde komplett umstrukturiert:

```
┌─────────────────────────────────────────┐
│                                         │
│   CONTENT-BEREICH                       │ ← Scrollbar mit Events, Habits, etc.
│   (Today/Week/Month-Ansicht)            │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│  📅 Termin │ ✓ Aufgabe│ 📓 Journal│ ● H │ ← Action-Buttons (60pt hoch)
├─────────────────────────────────────────┤
│                                         │
│  [Aktive Zeile 17pt groß             ]  │ ← FocusLineTextEditor
│  [Inaktive Zeilen 11pt (66%)         ]  │   (140pt hoch)
│  [mind. 3–4 Zeilen sichtbar          ]  │
│                                         │
├─────────────────────────────────────────┤
│  ┌──────┐  ┌──────┐  ┌──────┐          │
│  │  DO  │  │  DO  │  │ MON  │          │ ← Keyboard-Homebar
│  │ DAY  │  │MORROW│  │ YEAR │          │   (60pt hoch)
│  └──────┘  └──────┘  └──────┘          │
└─────────────────────────────────────────┘
```

---

## 🎨 Design-Änderungen

### 1. **Keyboard-Style Homebar (UNTEN)**

**Vorher:** Oben, flache Buttons  
**Jetzt:** Unten, 3D-Keyboard-Tasten

#### Button-Labels (zweizeilig):
- **DO DAY** = Heute (Today)
- **DO MORROW** = Diese Woche (Week)
- **MON YEAR** = Monat/Jahr (Month/Year)

#### Design-Features:
- ✅ 3D-Schatten-Effekt (wie Keyboard-Tasten)
- ✅ Press-Animation (Scale + Opacity)
- ✅ Blau hervorgehoben bei Selection
- ✅ Höhe: 60pt (52pt Button + 8pt Padding)

---

### 2. **Action-Buttons (OBERHALB TextView)**

**Vorher:** Ganz unten  
**Jetzt:** Direkt über dem TextView

#### Position:
```swift
VStack {
    contentView              // ← Content
    ActionBarView            // ← Action-Buttons HIER
    FocusLineTextEditor      // ← TextView
    KeyboardHomebarView      // ← Keyboard-Buttons
}
```

#### Styling:
- Höhe: 60pt
- Hintergrund: Hellgrau (`Color(white: 0.96)`)
- Top-Border: Dünne Linie (`0.5pt`)

---

### 3. **FocusLineTextEditor (Optimiert)**

#### Schriftgrößen:
- **Aktive Zeile:** 17pt (normal, touch-kompatibel)
- **Inaktive Zeilen:** 11pt (~66% von 17pt)

#### Höhe:
- **140pt** (statt 120pt) → Mehr Platz für 3-4 Zeilen

#### Rahmen:
- Gerundete Ecken (8pt)
- Dünner Border (1pt, grau)

---

## 📐 Layout-Höhen (iPhone 16)

| Element | Höhe | Position |
|---|---|---|
| **Content-Bereich** | Dynamisch | Oben |
| **Action-Buttons** | 60pt | Über TextView |
| **TextView** | 140pt | Über Homebar |
| **Keyboard-Homebar** | 60pt | Unten (+ 8pt Padding) |
| **Gesamt (fix)** | 268pt | — |

**Verfügbarer Content-Bereich (iPhone 16):**
- Bildschirmhöhe: ~844pt
- Safe Area Top: ~47pt
- Fix-Höhe: 268pt
- **→ Content: ~529pt**

---

## 🎯 Button-Labels im Detail

### DO DAY (Today)
```
┌──────────┐
│    DO    │  ← 14pt, semibold
│   DAY    │  ← 14pt, semibold
└──────────┘
```
- **Bedeutung:** "Do today" → Heute-Ansicht
- **Farbe:** Blau (wenn ausgewählt), Grau (wenn nicht)

### DO MORROW (Week)
```
┌──────────┐
│    DO    │
│ MORROW   │
└──────────┘
```
- **Bedeutung:** "Do tomorrow" → Diese Woche
- **Hinweis:** "Morrow" = altenglisch für "tomorrow"

### MON YEAR (Month/Year)
```
┌──────────┐
│   MON    │
│   YEAR   │
└──────────┘
```
- **Bedeutung:** "Month/Year" → Monats-/Jahresansicht
- **Toggle:** In der Ansicht zwischen Monat und Jahr wechseln

---

## 💡 Warum diese Labels?

### Sprachspiel mit "Do Day"
1. **Do Day** = "Do today" (mach heute)
2. **Do Morrow** = "Do tomorrow" (mach morgen/diese Woche)
3. **Mon Year** = "Month/Year" (Monat/Jahr)

### Konsistenz:
- Alle Labels sind **zweisilbig**
- Alle passen perfekt in **2 Zeilen**
- Alle haben **phonetische Ähnlichkeit**

---

## 🎨 Keyboard-Style Details

### 3D-Effekt via Shadow:
```swift
.shadow(
    color: Color.black.opacity(isSelected ? 0.3 : 0.15),
    radius: isSelected ? 4 : 2,
    x: 0,
    y: isSelected ? 2 : 1
)
```

### Press-Animation:
```swift
struct KeyboardButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .opacity(configuration.isPressed ? 0.8 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}
```

### Farben:
- **Unselected:** `Color(white: 0.95)` (hellgrau)
- **Selected:** `Color.blue` (iOS-Blau)
- **Text (Unselected):** `.primary` (schwarz/weiß je nach Dark Mode)
- **Text (Selected):** `.white`

---

## 📱 Preview-Geräte

### In ContentView.swift:
```swift
#Preview("iPhone 16 - Do Day") {
    ContentView()
        .previewDevice(PreviewDevice(rawValue: "iPhone 16"))
}

#Preview("iPhone 16 Pro Max") {
    ContentView()
        .previewDevice(PreviewDevice(rawValue: "iPhone 16 Pro Max"))
}
```

### In KeyboardHomebarView.swift:
- Einzelne Button-Ansicht
- Week Selected
- **Full iPhone 16 Demo** mit Content, ActionBar, TextView, Homebar

---

## 🚀 Wie testen?

### 1. In Xcode Canvas (rechts):
```swift
// In KeyboardHomebarView.swift
#Preview("iPhone 16") {
    // Vollständiges Layout-Demo
}
```

### 2. Im Simulator:
1. ⌘R (Run)
2. Gerät: iPhone 16 auswählen
3. Testen:
   - Buttons antippen → 3D-Press-Effekt
   - TextView bearbeiten → Fokus-Zeile wechselt Größe
   - Zwischen Scopes wechseln → Button-Highlight ändert sich

---

## ✅ Implementierte Dateien

| Datei | Status | Beschreibung |
|---|---|---|
| **ViewsKeyboardHomebarView.swift** | ✅ NEU | Keyboard-Style Homebar |
| **ContentView.swift** | ✅ UPDATED | Neues Layout (Buttons unten) |
| **ComponentsFocusLineTextEditor.swift** | ✅ UPDATED | Kommentare optimiert |
| **ViewsActionBarView.swift** | ✅ UPDATED | Styling für neue Position |

---

## 🎯 Nächste Schritte

### Phase 2a – Design-Finetuning
- [ ] Dark Mode testen
- [ ] Keyboard-Button-Farben anpassen
- [ ] TextView-Rahmen verfeinern ("Display-Ausschnitt"-Stil)

### Phase 2b – Funktionalität
- [ ] FocusLineTextEditor auf echtem Device testen
- [ ] Keyboard-Animation perfektionieren
- [ ] Action-Buttons funktional machen

### Phase 3 – Integration
- [ ] Kalender-Events in Content-Bereich anzeigen
- [ ] Habits in TodayView integrieren
- [ ] Text-Parsing für Event/Reminder-Erstellung

---

**Erstellt am:** 19. April 2026  
**Design-Version:** 2.0 (Keyboard-Style)  
**Optimiert für:** iPhone 16, iPhone 16 Pro Max
