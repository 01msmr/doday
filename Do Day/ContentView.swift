//
//  ContentView.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import SwiftUI

#if canImport(EventKit)
import EventKit
#endif

#if canImport(UserNotifications)
import UserNotifications
#endif

/// Hauptansicht der Do Day App
/// Kombiniert Homebar, Content-Views und ActionBar
struct ContentView: View {
    @State private var selectedScope: TimeScope = .today
    @State private var text: String = ""
    @StateObject private var storageService = StorageService.shared
    
    // Services (plattformabhängig initialisiert)
    #if canImport(EventKit)
    @StateObject private var calendarService = CalendarService()
    @StateObject private var reminderService = ReminderService()
    #endif
    
    @StateObject private var habitService = HabitService()
    
    #if canImport(UserNotifications)
    @StateObject private var notificationService = NotificationService()
    #endif
    
    @StateObject private var nextcloudConfig = NextcloudConfig()
    
    var body: some View {
        Group {
            if storageService.isConfigured {
                mainView
            } else {
                StorageSetupView()
            }
        }
    }
    
    private var mainView: some View {
        VStack(spacing: 0) {
            // Content-Bereich (abhängig von selectedScope)
            contentView
                .frame(maxHeight: .infinity)
            
            // ActionBar mit 4 festen Button-Positionen (OBERHALB des TextViews)
            ActionBarView(
                scope: selectedScope,
                onCreateEvent: { createEvent() },
                onCreateReminder: { createReminder() },
                onCreateJournal: { createJournal() },
                onToggleHabit: { toggleHabit() }
            )
            .padding(.bottom, 8)
            
            // Textfeld mit FocusLineTextEditor
            FocusLineTextEditor(text: $text)
                .frame(height: 140)
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
            
            // Homebar mit Keyboard-Style-Buttons (UNTEN)
            KeyboardHomebarView(selectedScope: $selectedScope)
                .padding(.bottom, 8)
        }
        .task {
            // Berechtigungen beim App-Start anfordern
            await requestPermissions()
        }
    }
    
    // MARK: - Content Views
    
    @ViewBuilder
    private var contentView: some View {
        switch selectedScope {
        case .today:
            TodayView()
        case .tomorrow:
            TomorrowView()
        case .week:
            WeekView()
        case .monthYear:
            MonthYearView()
        }
    }
    
    // MARK: - Actions
    
    private func createEvent() {
        print("📅 Termin erstellen aus Text: '\(text)'")
        // TODO: Text parsen, Event erstellen via CalendarService
        // Beispiel: "Arzt 14:00" → Event mit Titel "Arzt" um 14:00 Uhr
    }
    
    private func createReminder() {
        print("✓ Erinnerung erstellen aus Text: '\(text)'")
        // TODO: Text als Erinnerung speichern via ReminderService
    }
    
    private func createJournal() {
        print("📓 Journal-Eintrag speichern: '\(text)'")
        
        // Erstelle Journal-Eintrag mit aktuellem Scope und Text
        let entry = JournalEntry(scope: selectedScope, content: text, tags: [])
        
        do {
            try storageService.saveJournalEntry(entry)
            print("✅ Journal gespeichert: \(entry.fileName)")
            text = "" // Clear text after saving
        } catch {
            print("❌ Fehler beim Speichern: \(error.localizedDescription)")
        }
    }
    
    private func toggleHabit() {
        print("● Habit abhaken")
        // TODO: Habit-Auswahl anzeigen, abhaken via HabitService
    }
    
    // MARK: - Berechtigungen
    
    private func requestPermissions() async {
        #if canImport(EventKit)
        // Kalender-Berechtigung (nur iOS, macOS, watchOS)
        if calendarService.authorizationStatus == .notDetermined {
            _ = await calendarService.requestAccess()
        }
        
        // Erinnerungs-Berechtigung (nur iOS, macOS, watchOS)
        if reminderService.authorizationStatus == .notDetermined {
            _ = await reminderService.requestAccess()
        }
        #endif
        
        #if canImport(UserNotifications)
        // Benachrichtigungs-Berechtigung (alle Plattformen)
        if notificationService.authorizationStatus == .notDetermined {
            _ = await notificationService.requestAuthorization()
        }
        #endif
    }
}

#Preview {
    ContentView()
}

