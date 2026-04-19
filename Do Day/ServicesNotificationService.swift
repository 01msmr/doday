//
//  NotificationService.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import Foundation
import Combine

#if canImport(UserNotifications)
import UserNotifications

/// Service für lokale Benachrichtigungen
/// Morgen- und Abend-Reminder für Journal/Review
/// Verfügbar auf allen Apple-Plattformen
@available(iOS 10.0, macOS 10.14, watchOS 3.0, tvOS 10.0, *)
class NotificationService: ObservableObject {
    @Published var authorizationStatus: UNAuthorizationStatus = .notDetermined
    
    init() {
        checkAuthorizationStatus()
    }
    
    // MARK: - Berechtigungen
    
    /// Prüft aktuellen Berechtigungsstatus
    func checkAuthorizationStatus() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                self.authorizationStatus = settings.authorizationStatus
            }
        }
    }
    
    /// Fordert Benachrichtigungs-Berechtigungen an
    func requestAuthorization() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(
                options: [.alert, .sound, .badge]
            )
            await MainActor.run {
                checkAuthorizationStatus()
            }
            return granted
        } catch {
            print("Fehler bei Benachrichtigungs-Berechtigung: \(error)")
            return false
        }
    }
    
    // MARK: - Reminder planen
    
    /// Plant tägliche Morgen-Benachrichtigung
    /// - Parameter hour: Stunde (0-23), Standard: 8 Uhr
    func scheduleMorningReminder(hour: Int = 8) {
        let content = UNMutableNotificationContent()
        content.title = "Guten Morgen! ☀️"
        content.body = "Zeit für deinen Tages-Check. Was steht heute an?"
        content.sound = .default
        
        var dateComponents = DateComponents()
        dateComponents.hour = hour
        dateComponents.minute = 0
        
        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)
        
        let request = UNNotificationRequest(
            identifier: "morning-reminder",
            content: content,
            trigger: trigger
        )
        
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                print("Fehler beim Planen der Morgen-Benachrichtigung: \(error)")
            }
        }
    }
    
    /// Plant tägliche Abend-Benachrichtigung
    /// - Parameter hour: Stunde (0-23), Standard: 20 Uhr
    func scheduleEveningReminder(hour: Int = 20) {
        let content = UNMutableNotificationContent()
        content.title = "Tagesreview 🌙"
        content.body = "Wie war dein Tag? Zeit für ein kurzes Review."
        content.sound = .default
        
        var dateComponents = DateComponents()
        dateComponents.hour = hour
        dateComponents.minute = 0
        
        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)
        
        let request = UNNotificationRequest(
            identifier: "evening-reminder",
            content: content,
            trigger: trigger
        )
        
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                print("Fehler beim Planen der Abend-Benachrichtigung: \(error)")
            }
        }
    }
    
    /// Plant wöchentliche Review-Benachrichtigung (Sonntag Abend)
    func scheduleWeeklyReviewReminder() {
        let content = UNMutableNotificationContent()
        content.title = "Wochenreview 📝"
        content.body = "Zeit für dein Wochenreview. Wie war die Woche?"
        content.sound = .default
        
        var dateComponents = DateComponents()
        dateComponents.weekday = 1 // Sonntag
        dateComponents.hour = 19
        dateComponents.minute = 0
        
        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)
        
        let request = UNNotificationRequest(
            identifier: "weekly-review",
            content: content,
            trigger: trigger
        )
        
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                print("Fehler beim Planen der Wochen-Benachrichtigung: \(error)")
            }
        }
    }
    
    // MARK: - Reminder entfernen
    
    /// Entfernt alle geplanten Benachrichtigungen
    func removeAllReminders() {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
    }
    
    /// Entfernt spezifische Benachrichtigung
    func removeReminder(identifier: String) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier])
    }
    
    // MARK: - Status abfragen
    
    /// Gibt alle geplanten Benachrichtigungen zurück
    func getPendingNotifications() async -> [UNNotificationRequest] {
        return await UNUserNotificationCenter.current().pendingNotificationRequests()
    }
}

// MARK: - Später: Info.plist Eintrag NICHT erforderlich
// UserNotifications benötigt keinen Info.plist-Eintrag
// Nur Runtime-Berechtigung via requestAuthorization()
#else
// MARK: - Fallback (sollte nie auftreten, UserNotifications ist überall verfügbar)

/// Dummy-Service (sollte nicht benötigt werden)
class NotificationService: ObservableObject {
    init() {
        print("⚠️ UserNotifications nicht verfügbar")
    }
    
    func requestAuthorization() async -> Bool {
        return false
    }
}

#endif


