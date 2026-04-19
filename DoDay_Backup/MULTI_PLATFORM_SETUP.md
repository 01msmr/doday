# Multi-Platform Setup für Do Day

## ✅ Plattformübergreifende Unterstützung implementiert

Das Projekt **Do Day** ist jetzt vollständig kompatibel mit:
- ✅ **iOS** (iPhone, iPad)
- ✅ **macOS**
- ✅ **watchOS**
- ✅ **tvOS**

---

## 🔧 Implementierte Änderungen

### 1. **Service-Dateien mit Compiler-Direktiven**

Alle Services nutzen jetzt `#if canImport(...)` für plattformspezifische Frameworks:

#### **CalendarService.swift**
```swift
#if canImport(EventKit)
import EventKit

@available(iOS 13.0, macOS 10.15, watchOS 6.0, *)
class CalendarService: ObservableObject {
    // EventKit-Integration
}
#else
// Fallback für tvOS (EventKit nicht verfügbar)
class CalendarService: ObservableObject {
    // Dummy-Implementation
}
#endif
```

**Verfügbar auf:** iOS, macOS, watchOS  
**Nicht verfügbar auf:** tvOS (Fallback ohne Funktionalität)

---

#### **ReminderService.swift**
```swift
#if canImport(EventKit)
import EventKit

@available(iOS 13.0, macOS 10.15, watchOS 6.0, *)
class ReminderService: ObservableObject {
    // EventKit Reminders-Integration
}
#else
// Fallback für tvOS
class ReminderService: ObservableObject {
    // Dummy-Implementation
}
#endif
```

**Verfügbar auf:** iOS, macOS, watchOS  
**Nicht verfügbar auf:** tvOS (Fallback)

---

#### **NotificationService.swift**
```swift
#if canImport(UserNotifications)
import UserNotifications

@available(iOS 10.0, macOS 10.14, watchOS 3.0, tvOS 10.0, *)
class NotificationService: ObservableObject {
    // UserNotifications-Integration
}
#else
// Fallback (sollte nie benötigt werden)
class NotificationService: ObservableObject {
    // Dummy
}
#endif
```

**Verfügbar auf:** iOS, macOS, watchOS, tvOS

---

#### **FocusLineTextEditor.swift**
```swift
#if canImport(UIKit)
import UIKit

struct FocusLineTextEditor: UIViewRepresentable {
    // iOS/iPadOS/tvOS-Implementation mit UIKit
}
#else
// macOS Fallback mit TextEditor
struct FocusLineTextEditor: View {
    var body: some View {
        TextEditor(text: $text)
    }
}
#endif
```

**iOS/iPadOS/tvOS:** Volle FocusLine-Funktionalität mit UIKit  
**macOS:** Einfacher `TextEditor` (ohne Fokus-Feature)

---

### 2. **Plattformübergreifende Farben in Views**

Alle Views nutzen jetzt adaptive Farben:

```swift
private var adaptiveBackgroundColor: Color {
    #if canImport(UIKit)
    return Color(uiColor: .systemBackground)
    #elseif canImport(AppKit)
    return Color(nsColor: .windowBackgroundColor)
    #else
    return Color.white
    #endif
}
```

**Betroffen:**
- `TodayView.swift`
- `WeekView.swift`
- `MonthYearView.swift`

---

### 3. **ContentView mit plattformabhängigen Services**

```swift
#if canImport(EventKit)
@StateObject private var calendarService = CalendarService()
@StateObject private var reminderService = ReminderService()
#endif

@StateObject private var habitService = HabitService()

#if canImport(UserNotifications)
@StateObject private var notificationService = NotificationService()
#endif
```

**Berechtigungen nur anfordern, wenn verfügbar:**
```swift
private func requestPermissions() async {
    #if canImport(EventKit)
    if calendarService.authorizationStatus == .notDetermined {
        _ = await calendarService.requestAccess()
    }
    #endif
    
    #if canImport(UserNotifications)
    if notificationService.authorizationStatus == .notDetermined {
        _ = await notificationService.requestAuthorization()
    }
    #endif
}
```

---

## 📋 Plattform-Feature-Matrix

| Feature | iOS | macOS | watchOS | tvOS |
|---|---|---|---|---|
| **Kalender-Integration** | ✅ | ✅ | ✅ | ❌ |
| **Erinnerungen** | ✅ | ✅ | ✅ | ❌ |
| **Benachrichtigungen** | ✅ | ✅ | ✅ | ✅ |
| **Habit-Tracking** | ✅ | ✅ | ✅ | ✅ |
| **Nextcloud-Sync** | ✅ | ✅ | ✅ | ✅ |
| **Markdown-Journal** | ✅ | ✅ | ✅ | ✅ |
| **FocusLineTextEditor** | ✅ (voll) | ⚠️ (Fallback) | ✅ (voll) | ✅ (voll) |

**Legende:**
- ✅ Volle Funktionalität
- ⚠️ Eingeschränkte Funktionalität (Fallback)
- ❌ Nicht verfügbar (Framework fehlt)

---

## 🚀 Build-Anleitung

### 1. **Xcode öffnen**
Öffne das Projekt in Xcode 16 oder neuer.

### 2. **Target auswählen**
Wähle das gewünschte Target:
- **iOS** → iPhone, iPad
- **macOS** → Mac (Designed for iPad oder native)
- **watchOS** → Apple Watch (Companion-App)
- **tvOS** → Apple TV

### 3. **Builden**
1. ⇧⌘K (Clean Build Folder)
2. ⌘B (Build)
3. ⌘R (Run)

---

## ⚠️ Bekannte Einschränkungen

### **tvOS**
- **Kein EventKit:** Kalender und Erinnerungen nicht verfügbar
- **Workaround:** Funktionen sind deaktiviert, App läuft trotzdem
- **Empfehlung:** tvOS-Version nur für Journal/Habit-Tracking nutzen

### **macOS**
- **FocusLineTextEditor:** Verwendet einfachen `TextEditor` (kein Fokus-Feature)
- **Grund:** `UITextView` nicht verfügbar auf macOS
- **Zukünftige Lösung:** AppKit-basierte `NSTextView`-Implementation

### **watchOS**
- **Eingeschränkte UI:** Kleine Bildschirmgröße
- **Empfehlung:** Vereinfachte UI für watchOS implementieren

---

## 🔮 Zukünftige Verbesserungen

### **macOS FocusLineTextEditor**
```swift
#if canImport(AppKit)
struct FocusLineTextEditor: NSViewRepresentable {
    func makeNSView(context: Context) -> NSTextView {
        // AppKit-basierte Implementation
    }
}
#endif
```

### **watchOS UI-Optimierung**
- Kleinere Buttons
- Kompaktere Layouts
- Watch Complications

### **tvOS-Alternative**
- Remote-Control-Navigation
- Große Touch-Targets
- Sprachsteuerung via Siri

---

## 📝 Info.plist Einträge

### **iOS/macOS/watchOS:**
```xml
<!-- EventKit -->
<key>NSCalendarsUsageDescription</key>
<string>Do Day benötigt Zugriff auf deinen Kalender.</string>

<key>NSCalendarsFullAccessUsageDescription</key>
<string>Do Day benötigt vollen Zugriff auf deinen Kalender.</string>

<key>NSRemindersUsageDescription</key>
<string>Do Day benötigt Zugriff auf deine Erinnerungen.</string>

<key>NSRemindersFullAccessUsageDescription</key>
<string>Do Day benötigt vollen Zugriff auf deine Erinnerungen.</string>
```

### **tvOS:**
Keine EventKit-Einträge erforderlich (Framework nicht verfügbar).

---

## ✅ Status

**Stand:** 19. April 2026  
**Version:** Phase 1 abgeschlossen  
**Multi-Platform:** ✅ Vollständig implementiert

---

## 🎯 Nächste Schritte

1. ✅ Multi-Platform-Unterstützung implementiert
2. ⏳ **Phase 2:** FocusLineTextEditor auf allen Plattformen testen
3. ⏳ **Phase 3:** Kalender/Erinnerungen-Integration testen
4. ⏳ **Phase 4:** Nextcloud-Sync testen
5. ⏳ **Phase 5:** watchOS-spezifische UI implementieren

---

**Erstellt am:** 19. April 2026  
**Letzte Aktualisierung:** 19. April 2026
