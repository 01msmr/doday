//
//  ReminderService.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import Foundation
import Combine

#if canImport(EventKit)
import EventKit

/// Service für EventKit Erinnerungen-Integration
/// Greift auf iOS Reminders App zu (inkl. CalDAV-Sync via Nextcloud)
/// WICHTIG: Nur auf iOS, macOS, watchOS verfügbar (nicht auf tvOS)
@available(iOS 13.0, macOS 10.15, watchOS 6.0, *)
class ReminderService: ObservableObject {
    private let eventStore = EKEventStore()
    @Published var reminders: [EKReminder] = []
    @Published var authorizationStatus: EKAuthorizationStatus = .notDetermined
    
    init() {
        checkAuthorizationStatus()
    }
    
    // MARK: - Berechtigungen
    
    /// Prüft aktuellen Berechtigungsstatus
    func checkAuthorizationStatus() {
        authorizationStatus = EKEventStore.authorizationStatus(for: .reminder)
    }
    
    /// Fordert Erinnerungs-Berechtigungen an
    func requestAccess() async -> Bool {
        do {
            let granted = try await eventStore.requestFullAccessToReminders()
            await MainActor.run {
                checkAuthorizationStatus()
            }
            return granted
        } catch {
            print("Fehler bei Erinnerungs-Berechtigung: \(error)")
            return false
        }
    }
    
    // MARK: - Erinnerungen laden
    
    /// Lädt alle unerledigten Erinnerungen
    func loadIncompleteReminders() async -> [EKReminder] {
        guard authorizationStatus == .fullAccess else {
            print("Keine Erinnerungs-Berechtigung")
            return []
        }
        
        // Prädikat für unerledigte Erinnerungen
        let predicate = eventStore.predicateForIncompleteReminders(
            withDueDateStarting: nil,
            ending: nil,
            calendars: nil // nil = alle Kalender
        )
        
        return await withCheckedContinuation { continuation in
            eventStore.fetchReminders(matching: predicate) { reminders in
                continuation.resume(returning: reminders ?? [])
            }
        }
    }
    
    /// Lädt heute fällige Erinnerungen
    func loadTodayReminders() async -> [EKReminder] {
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: Date())
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay) ?? Date()
        
        guard authorizationStatus == .fullAccess else {
            print("Keine Erinnerungs-Berechtigung")
            return []
        }
        
        let predicate = eventStore.predicateForIncompleteReminders(
            withDueDateStarting: startOfDay,
            ending: endOfDay,
            calendars: nil
        )
        
        let reminders = await withCheckedContinuation { continuation in
            eventStore.fetchReminders(matching: predicate) { reminders in
                continuation.resume(returning: reminders ?? [])
            }
        }
        
        await MainActor.run {
            self.reminders = reminders
        }
        
        return reminders
    }
    
    /// Lädt Erinnerungen für diese Woche
    func loadWeekReminders(weekOffset: Int = 0) async -> [EKReminder] {
        let calendar = Calendar.current
        let now = Date()
        
        // Woche berechnen
        guard let targetWeek = calendar.date(byAdding: .weekOfYear, value: weekOffset, to: now) else {
            return []
        }
        
        // Wochenstart (Montag)
        let weekday = calendar.component(.weekday, from: targetWeek)
        let daysToMonday = (weekday == 1) ? -6 : -(weekday - 2)
        guard let monday = calendar.date(byAdding: .day, value: daysToMonday, to: targetWeek),
              let sunday = calendar.date(byAdding: .day, value: 7, to: monday) else {
            return []
        }
        
        guard authorizationStatus == .fullAccess else {
            print("Keine Erinnerungs-Berechtigung")
            return []
        }
        
        let predicate = eventStore.predicateForIncompleteReminders(
            withDueDateStarting: monday,
            ending: sunday,
            calendars: nil
        )
        
        return await withCheckedContinuation { continuation in
            eventStore.fetchReminders(matching: predicate) { reminders in
                continuation.resume(returning: reminders ?? [])
            }
        }
    }
    
    // MARK: - Erinnerung erstellen
    
    /// Erstellt eine neue Erinnerung
    /// - Parameters:
    ///   - title: Titel der Erinnerung
    ///   - dueDate: Optional: Fälligkeitsdatum
    ///   - notes: Optional: Notizen
    ///   - priority: Optional: Priorität (0 = keine, 1-4 = niedrig, 5 = mittel, 6-9 = hoch)
    /// - Returns: true bei Erfolg
    func createReminder(title: String, dueDate: Date? = nil, notes: String? = nil, priority: Int = 0) async -> Bool {
        guard authorizationStatus == .fullAccess else {
            print("Keine Erinnerungs-Berechtigung")
            return false
        }
        
        let reminder = EKReminder(eventStore: eventStore)
        reminder.title = title
        reminder.calendar = eventStore.defaultCalendarForNewReminders()
        reminder.notes = notes
        reminder.priority = priority
        
        // Fälligkeitsdatum setzen
        if let dueDate = dueDate {
            let dueDateComponents = Calendar.current.dateComponents(
                [.year, .month, .day, .hour, .minute],
                from: dueDate
            )
            reminder.dueDateComponents = dueDateComponents
        }
        
        do {
            try eventStore.save(reminder, commit: true)
            return true
        } catch {
            print("Fehler beim Erstellen der Erinnerung: \(error)")
            return false
        }
    }
    
    /// Markiert eine Erinnerung als erledigt
    /// - Parameter reminder: Die zu erledigende Erinnerung
    /// - Returns: true bei Erfolg
    func completeReminder(_ reminder: EKReminder) async -> Bool {
        guard authorizationStatus == .fullAccess else {
            print("Keine Erinnerungs-Berechtigung")
            return false
        }
        
        reminder.isCompleted = true
        
        do {
            try eventStore.save(reminder, commit: true)
            return true
        } catch {
            print("Fehler beim Abhaken der Erinnerung: \(error)")
            return false
        }
    }
}

// MARK: - Später: Info.plist Eintrag erforderlich
// NSRemindersUsageDescription: "Do Day benötigt Zugriff auf deine Erinnerungen, um Aufgaben anzuzeigen und zu erstellen."
// NSRemindersFullAccessUsageDescription: "Do Day benötigt vollen Zugriff auf deine Erinnerungen."
#else
// MARK: - Fallback für tvOS (EventKit nicht verfügbar)

/// Dummy-Service für Plattformen ohne EventKit (z.B. tvOS)
class ReminderService: ObservableObject {
    @Published var reminders: [String] = [] // Placeholder
    
    init() {
        print("⚠️ ReminderService nicht verfügbar auf dieser Plattform (tvOS)")
    }
    
    func requestAccess() async -> Bool {
        print("⚠️ EventKit nicht verfügbar")
        return false
    }
    
    func loadTodayReminders() async -> [String] {
        return []
    }
    
    func loadWeekReminders(weekOffset: Int = 0) async -> [String] {
        return []
    }
}

#endif


