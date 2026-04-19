//
//  HabitService.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import Foundation
import Combine

/// Service für Habit-Tracking
/// Verwaltet max. 5-7 Habits, Speicherung in habits.json (lokal + später Nextcloud)
class HabitService: ObservableObject {
    @Published var habitData: HabitData = HabitData()
    
    // Lokaler Speicherpfad
    private let localFileName = "habits.json"
    
    init() {
        loadLocalHabits()
    }
    
    // MARK: - Lokales Laden/Speichern
    
    /// Lädt Habits aus lokalem Speicher
    func loadLocalHabits() {
        guard let url = getLocalFileURL() else { return }
        
        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            habitData = try decoder.decode(HabitData.self, from: data)
        } catch {
            print("Fehler beim Laden der Habits: \(error)")
            // Bei Fehler: Initialisiere mit Standard-Habits
            initializeDefaultHabits()
        }
    }
    
    /// Speichert Habits lokal
    func saveLocalHabits() {
        guard let url = getLocalFileURL() else { return }
        
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .prettyPrinted
            let data = try encoder.encode(habitData)
            try data.write(to: url)
        } catch {
            print("Fehler beim Speichern der Habits: \(error)")
        }
    }
    
    /// Gibt die URL für lokale Speicherung zurück
    private func getLocalFileURL() -> URL? {
        let fileManager = FileManager.default
        guard let documentsDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return nil
        }
        return documentsDirectory.appendingPathComponent(localFileName)
    }
    
    // MARK: - Habit-Verwaltung
    
    /// Fügt ein neues Habit hinzu
    func addHabit(name: String, icon: String = "circle", color: String = "#007AFF") {
        let sortOrder = habitData.habits.count
        let newHabit = Habit(name: name, icon: icon, color: color, sortOrder: sortOrder)
        habitData.habits.append(newHabit)
        saveLocalHabits()
    }
    
    /// Löscht ein Habit
    func deleteHabit(_ habit: Habit) {
        habitData.habits.removeAll { $0.id == habit.id }
        habitData.completions.removeAll { $0.habitId == habit.id }
        saveLocalHabits()
    }
    
    /// Aktualisiert ein Habit
    func updateHabit(_ habit: Habit) {
        if let index = habitData.habits.firstIndex(where: { $0.id == habit.id }) {
            habitData.habits[index] = habit
            saveLocalHabits()
        }
    }
    
    // MARK: - Completion-Verwaltung
    
    /// Togglet den Completion-Status eines Habits für heute
    func toggleCompletion(for habit: Habit, date: Date = Date()) {
        let calendar = Calendar.current
        let targetDay = calendar.startOfDay(for: date)
        
        // Suche bestehende Completion
        if let index = habitData.completions.firstIndex(where: { completion in
            completion.habitId == habit.id &&
            calendar.isDate(completion.date, inSameDayAs: targetDay)
        }) {
            // Toggle existing completion
            habitData.completions[index].completed.toggle()
        } else {
            // Erstelle neue Completion
            let completion = HabitCompletion(habitId: habit.id, date: targetDay, completed: true)
            habitData.completions.append(completion)
        }
        
        saveLocalHabits()
    }
    
    /// Prüft, ob ein Habit heute erledigt ist
    func isCompletedToday(habit: Habit) -> Bool {
        return habitData.isCompleted(habitId: habit.id, date: Date())
    }
    
    /// Gibt Completion-Rate für einen Zeitraum zurück (0.0 - 1.0)
    func completionRate(for habit: Habit, days: Int = 7) -> Double {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        
        var completedDays = 0
        
        for dayOffset in 0..<days {
            if let date = calendar.date(byAdding: .day, value: -dayOffset, to: today) {
                if habitData.isCompleted(habitId: habit.id, date: date) {
                    completedDays += 1
                }
            }
        }
        
        return Double(completedDays) / Double(days)
    }
    
    // MARK: - Standard-Habits
    
    /// Initialisiert Standard-Habits (beim ersten Start)
    private func initializeDefaultHabits() {
        habitData = HabitData(habits: [
            Habit(name: "Meditation", icon: "brain.head.profile", color: "#9B59B6", sortOrder: 0),
            Habit(name: "Sport", icon: "figure.walk", color: "#E74C3C", sortOrder: 1),
            Habit(name: "Lesen", icon: "book", color: "#3498DB", sortOrder: 2)
        ], completions: [])
        
        saveLocalHabits()
    }
}

// MARK: - Später: WebDAV-Sync mit Nextcloud
// - habits.json hochladen nach /Notes/Journal/habits.json
// - Konfliktlösung: Server gewinnt (einfach halten)
