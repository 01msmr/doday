//
//  CalendarService.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import Foundation
import EventKit

/// Service für EventKit Kalender-Integration
/// Liest CalDAV-Kalender (z.B. Nextcloud) direkt via iOS-System
/// Keine eigene Sync-Logik nötig!
class CalendarService: ObservableObject {
    private let eventStore = EKEventStore()
    @Published var events: [EKEvent] = []
    @Published var authorizationStatus: EKAuthorizationStatus = .notDetermined
    
    init() {
        checkAuthorizationStatus()
    }
    
    // MARK: - Berechtigungen
    
    /// Prüft aktuellen Berechtigungsstatus
    func checkAuthorizationStatus() {
        authorizationStatus = EKEventStore.authorizationStatus(for: .event)
    }
    
    /// Fordert Kalender-Berechtigungen an
    func requestAccess() async -> Bool {
        do {
            let granted = try await eventStore.requestFullAccessToEvents()
            await MainActor.run {
                checkAuthorizationStatus()
            }
            return granted
        } catch {
            print("Fehler bei Kalender-Berechtigung: \(error)")
            return false
        }
    }
    
    // MARK: - Events laden
    
    /// Lädt Events für einen bestimmten Zeitraum
    /// - Parameters:
    ///   - startDate: Start-Datum
    ///   - endDate: End-Datum
    /// - Returns: Array von EKEvent
    func loadEvents(from startDate: Date, to endDate: Date) async -> [EKEvent] {
        guard authorizationStatus == .fullAccess else {
            print("Keine Kalender-Berechtigung")
            return []
        }
        
        // Prädikat für Zeitraum erstellen
        let predicate = eventStore.predicateForEvents(
            withStart: startDate,
            end: endDate,
            calendars: nil // nil = alle Kalender
        )
        
        // Events abrufen
        let events = eventStore.events(matching: predicate)
        
        await MainActor.run {
            self.events = events
        }
        
        return events
    }
    
    /// Lädt Events für heute
    func loadTodayEvents() async -> [EKEvent] {
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: Date())
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay) ?? Date()
        
        return await loadEvents(from: startOfDay, to: endOfDay)
    }
    
    /// Lädt Events für diese Woche
    func loadWeekEvents(weekOffset: Int = 0) async -> [EKEvent] {
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
        
        return await loadEvents(from: monday, to: sunday)
    }
    
    // MARK: - Event erstellen
    
    /// Erstellt einen neuen Kalender-Eintrag
    /// - Parameters:
    ///   - title: Titel des Events
    ///   - startDate: Start-Datum/-Zeit
    ///   - endDate: End-Datum/-Zeit
    ///   - notes: Optional: Notizen
    /// - Returns: true bei Erfolg
    func createEvent(title: String, startDate: Date, endDate: Date, notes: String? = nil) async -> Bool {
        guard authorizationStatus == .fullAccess else {
            print("Keine Kalender-Berechtigung")
            return false
        }
        
        let event = EKEvent(eventStore: eventStore)
        event.title = title
        event.startDate = startDate
        event.endDate = endDate
        event.notes = notes
        event.calendar = eventStore.defaultCalendarForNewEvents
        
        do {
            try eventStore.save(event, span: .thisEvent)
            return true
        } catch {
            print("Fehler beim Erstellen des Events: \(error)")
            return false
        }
    }
}

// MARK: - Später: Info.plist Eintrag erforderlich
// NSCalendarsUsageDescription: "Do Day benötigt Zugriff auf deinen Kalender, um Termine anzuzeigen und zu erstellen."
// NSCalendarsFullAccessUsageDescription: "Do Day benötigt vollen Zugriff auf deinen Kalender."
