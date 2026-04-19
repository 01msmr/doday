# ⌨️ Mechanische Keycaps Design-Dokumentation

## 🎨 Layout-Übersicht

Das neue Keyboard-Design verwendet **realistische mechanische Keycaps** (Cherry MX Profile):

```
┌────────────────────┬─────────┬─────────┐
│   DO    │    DO    │         │         │
│  DAY    │  MORROW  │  WEEK   │   MON   │
│         │          │         │  YEAR   │
└────────────────────┴─────────┴─────────┘
  ← 2x Breite →      ← Normal→ ← Normal→
```

---

## 🔘 Button-Struktur

### 1. **Dual-Button (DO DAY | DO MORROW)**
- **Breite:** 160pt (2x normale Button-Breite)
- **Höhe:** 56pt
- **Layout:** Zweigeteilt mit Trennlinie in der Mitte

#### Linke Hälfte: DO DAY
```
┌──────────┐
│    DO    │  ← 13pt, .rounded
│   DAY    │  ← 13pt, .rounded
└──────────┘
```
- **Aktion:** `selectedScope = .today`
- **Highlight:** Blau wenn `selectedScope == .today`

#### Rechte Hälfte: DO MORROW
```
┌──────────┐
│    DO    │  ← 12pt, .rounded
│  MORROW  │  ← 11pt, .rounded (kleinere Schrift wegen Länge)
└──────────┘
```
- **Aktion:** `selectedScope = .week`
- **Highlight:** Blau wenn `selectedScope == .week`

#### Toggle-Verhalten:
```swift
private func toggleTodayWeek() {
    if selectedScope == .today {
        selectedScope = .week
    } else {
        selectedScope = .today
    }
}
```
- **Bei Tap:** Wechselt zwischen Today ↔ Week

---

### 2. **Single-Button: WEEK**
```
┌──────────┐
│   WEEK   │  ← 13pt, .rounded
│          │
└──────────┘
```
- **Breite:** ~80pt (automatisch)
- **Höhe:** 56pt
- **Aktion:** `selectedScope = .week`
- **Highlight:** Blau wenn ausgewählt

---

### 3. **Single-Button: MON YEAR**
```
┌──────────┐
│   MON    │  ← 13pt, .rounded
│   YEAR   │  ← 13pt, .rounded
└──────────┘
```
- **Breite:** ~80pt (automatisch)
- **Höhe:** 56pt
- **Aktion:** `selectedScope = .monthYear`
- **Highlight:** Blau wenn ausgewählt

---

## 🎨 Mechanisches Keycap-Design

### Inspiration: Cherry MX Profile
- **Nicht Gaming-Style** ❌
- **Realistische mechanische Tastatur** ✅
- **Cherry MX / OEM Profile** ✅

### Design-Features:

#### 1. **Gradient (3D-Effekt)**
```swift
LinearGradient(
    colors: isSelected ? [
        Color(red: 0.35, green: 0.35, blue: 0.38),  // Dunkler (gedrückt)
        Color(red: 0.25, green: 0.25, blue: 0.28)
    ] : [
        Color(red: 0.45, green: 0.45, blue: 0.48),  // Heller
        Color(red: 0.35, green: 0.35, blue: 0.38)
    ],
    startPoint: .top,
    endPoint: .bottom
)
```

#### 2. **Highlight am oberen Rand**
```swift
LinearGradient(
    colors: [
        Color.white.opacity(0.15),  // Oben hell
        Color.white.opacity(0.0)     // Unten transparent
    ],
    startPoint: .top,
    endPoint: .bottom
)
.frame(height: 12)  // Nur obere 12pt
```

#### 3. **Schatten (Tiefe)**
```swift
.shadow(
    color: .black.opacity(0.5), 
    radius: 3, 
    x: 0, 
    y: 3  // Nach unten
)
```

#### 4. **Border (Kanten-Definition)**
```swift
.stroke(Color.black.opacity(0.4), lineWidth: 1.5)
```

---

## 🎨 Farben

### Keycap-Farben:
| Status | Top-Gradient | Bottom-Gradient |
|---|---|---|
| **Unselected** | RGB(115, 115, 122) | RGB(89, 89, 97) |
| **Selected** | RGB(89, 89, 97) | RGB(64, 64, 71) |

### Text-Farben:
| Status | Farbe | Hex |
|---|---|---|
| **Unselected** | Hellgrau | `Color(white: 0.85)` |
| **Selected** | Cyan-Blau | `Color(red: 0.2, green: 0.8, blue: 1.0)` |

### Hintergrund (Keyboard-Base):
```swift
LinearGradient(
    colors: [
        Color(white: 0.18),  // Oben
        Color(white: 0.12)   // Unten
    ],
    startPoint: .top,
    endPoint: .bottom
)
```

---

## ⚙️ Press-Animation

```swift
struct KeycapButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1.0)
            .offset(y: configuration.isPressed ? 2 : 0)  // Nach unten
            .shadow(
                color: .black.opacity(configuration.isPressed ? 0.3 : 0.5), 
                radius: configuration.isPressed ? 1 : 3, 
                x: 0, 
                y: configuration.isPressed ? 1 : 3
            )
            .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
    }
}
```

### Effekt:
1. **Scale:** 96% (leicht verkleinern)
2. **Offset:** 2pt nach unten (wie echtes Drücken)
3. **Shadow:** Reduziert beim Drücken
4. **Animation:** 80ms ease-out

---

## 📐 Maße

| Element | Breite | Höhe |
|---|---|---|
| **Dual-Button** | 160pt | 56pt |
| **Single-Button** | ~80pt (flex) | 56pt |
| **Spacing** | 6pt | — |
| **Padding (horizontal)** | 10pt | — |
| **Padding (vertical)** | 8pt | — |
| **Gesamt-Höhe** | — | ~72pt |

---

## 🔤 Typografie

### Font:
```swift
.font(.system(size: 13, weight: .medium, design: .rounded))
```

- **Family:** SF Pro Rounded (`.rounded`)
- **Weight:** Medium (nicht Bold, nicht Regular)
- **Größe:** 11pt–13pt (je nach Textlänge)

### Warum `.rounded`?
- Weicher, weniger technisch als `.monospaced`
- Freundlicher als `.default`
- Passt zu mechanischen Keycaps (nicht zu kantig)

---

## 🎯 Interaktion

### Dual-Button-Logik:
```
User tippt auf linke Hälfte (DO DAY):
  → selectedScope = .today

User tippt auf rechte Hälfte (DO MORROW):
  → selectedScope = .week

User tippt irgendwo auf Dual-Button:
  → Toggle zwischen .today ↔ .week
```

### Warum ein Button statt zwei?
- **Platzsparend:** 2 Funktionen in einem großen Button
- **Visuell zusammenhängend:** DO DAY und DO MORROW gehören zusammen
- **Toggle-Funktion:** Schnelles Wechseln

---

## 📱 Preview-Geräte

### In ViewsKeyboardHomebarView.swift:

1. **"Keycaps - Today Selected"**
   - Zeigt nur die Keycaps
   - Today ausgewählt
   - Schwarzer Hintergrund

2. **"Keycaps - Week Selected"**
   - Zeigt nur die Keycaps
   - Week ausgewählt
   - Schwarzer Hintergrund

3. **"iPhone 16 Pro - Full Layout"**
   - Vollständiges App-Layout
   - Content + ActionBar + TextView + Keycaps
   - Realistische Bildschirmgröße

---

## 🚀 Verwendung

### In ContentView.swift:
```swift
KeyboardHomebarView(selectedScope: $selectedScope)
    .padding(.bottom, 8)
```

### State-Binding:
```swift
@State private var selectedScope: TimeScope = .today
```

### Automatisches Highlighting:
- Button highlightet sich automatisch basierend auf `selectedScope`
- Keine manuelle Logik nötig

---

## ✨ Design-Details (wie echte Keycaps)

### 1. **Rounded Corners**
```swift
.clipShape(RoundedRectangle(cornerRadius: 6))
```
- 6pt Radius (nicht zu rund, nicht zu eckig)

### 2. **Layered Shadows**
- **Outer Shadow:** 3pt Radius, 3pt nach unten
- **Press Shadow:** 1pt Radius, 1pt nach unten

### 3. **Highlight (Shine)**
- Nur am oberen Rand (12pt hoch)
- Weißer Gradient mit 15% Opacity
- Simuliert Lichtreflexion

### 4. **Border**
- 1.5pt dick
- Schwarz mit 40% Opacity
- Definiert Kanten scharf

---

## 🎨 Farbpalette (RGB)

| Farbe | RGB | Verwendung |
|---|---|---|
| **Keycap (hell)** | (115, 115, 122) | Unselected Top |
| **Keycap (mittel)** | (89, 89, 97) | Unselected Bottom / Selected Top |
| **Keycap (dunkel)** | (64, 64, 71) | Selected Bottom |
| **Text (hell)** | (217, 217, 217) | Unselected Text |
| **Text (cyan)** | (51, 204, 255) | Selected Text |
| **Base (hell)** | (46, 46, 46) | Keyboard-Hintergrund Top |
| **Base (dunkel)** | (31, 31, 31) | Keyboard-Hintergrund Bottom |

---

## 🔮 Zukünftige Verbesserungen

### Phase 2a:
- [ ] Custom SF Symbol für Keycaps (optional)
- [ ] Haptic Feedback beim Drücken
- [ ] Sound-Effekt (Tastatur-Klick) optional

### Phase 2b:
- [ ] Dark Mode Anpassung (hellere Keycaps)
- [ ] Accessibility: VoiceOver-Labels
- [ ] Accessibility: Größere Hit-Targets (44×44pt minimum)

### Phase 3:
- [ ] Alternative Keycap-Profile (DSA, SA)
- [ ] Farbthemen (GMK-inspiriert)
- [ ] Animations-Optionen (Bouncy, Smooth, None)

---

**Erstellt am:** 19. April 2026  
**Design-Version:** 3.0 (Mechanische Keycaps)  
**Inspiriert von:** Cherry MX Profile, OEM Keycaps  
**Optimiert für:** iPhone 16 Pro, iPhone SE
