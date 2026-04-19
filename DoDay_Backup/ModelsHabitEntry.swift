//
//  HabitEntry.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import Foundation

/// Model für einen Habit (Gewohnheit)
/// Max. 5–7 Habits, nur in der Heute-Ansicht sichtbar
/// Wird als habits.json in Nextcloud gespeichert
struct Habit: Identifiable, Codable {
    let id: UUID
    var name: String
    var icon: String  // SF Symbol Name, z.B. "figure.walk"
    var color: String // Hex-Code für Farbe, z.B. "#FF5733"
    var isActive: Bool // Ob Habit aktuell aktiv/sichtbar ist
    var sortOrder: Int // Reihenfolge in der Liste
    
    init(name: String, icon: String = "circle", color: String = "#007AFF", isActive: Bool = true, sortOrder: Int = 0) {
        self.id = UUID()
        self.name = name
        self.icon = icon
        self.color = color
        self.isActive = isActive
        self.sortOrder = sortOrder
    }
}

/// Model für das tägliche Abhaken eines Habits
/// Speichert, ob ein Habit an einem bestimmten Tag erledigt wurde
struct HabitCompletion: Identifiable, Codable {
    let id: UUID
    let habitId: UUID
    let date: Date
    var completed: Bool
    
    init(habitId: UUID, date: Date = Date(), completed: Bool = false) {
        self.id = UUID()
        self.habitId = habitId
        self.date = date
        self.completed = completed
    }
    
    /// Datum ohne Uhrzeit für Vergleiche
    var dateOnly: Date {
        let calendar = Calendar.current
        return calendar.startOfDay(for: date)
    }
}

/// Container für alle Habit-Daten
/// Wird als habits.json gespeichert
struct HabitData: Codable {
    var habits: [Habit]
    var completions: [HabitCompletion]
    
    init(habits: [Habit] = [], completions: [HabitCompletion] = []) {
        self.habits = habits
        self.completions = completions
    }
    
    /// Gibt alle aktiven Habits sortiert zurück
    var activeHabits: [Habit] {
        return habits
            .filter { $0.isActive }
            .sorted { $0.sortOrder < $1.sortOrder }
    }
    
    /// Prüft, ob ein Habit an einem bestimmten Tag abgehakt ist
    func isCompleted(habitId: UUID, date: Date) -> Bool {
        let calendar = Calendar.current
        let targetDay = calendar.startOfDay(for: date)
        
        return completions.contains { completion in
            completion.habitId == habitId &&
            calendar.isDate(completion.date, inSameDayAs: targetDay) &&
            completion.completed
        }
    }
}
