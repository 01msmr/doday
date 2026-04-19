//
//  TodayView.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import SwiftUI

/// Heute-Ansicht (50% Breite in Homebar)
/// Zeigt: Kalender-Events, Habits, fällige Erinnerungen
struct TodayView: View {
    @State private var text: String = ""
    
    var body: some View {
        VStack(spacing: 0) {
            // Inhaltsbereich: Events, Habits, Erinnerungen
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Header mit Datum
                    todayHeader
                    
                    // Kalender-Events (später via CalendarService)
                    sectionHeader("Termine")
                    placeholderContent("Keine Termine heute")
                    
                    // Habits (später via HabitService)
                    sectionHeader("Habits")
                    placeholderHabits
                    
                    // Erinnerungen (später via ReminderService)
                    sectionHeader("Erinnerungen")
                    placeholderContent("Keine fälligen Erinnerungen")
                }
                .padding()
            }
            
            Spacer()
            
            // Textfeld (später: FocusLineTextEditor)
            textEditorPlaceholder
        }
    }
    
    // MARK: - Hilfskomponenten
    
    private var todayHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Heute")
                .font(.system(size: 28, weight: .bold))
            Text(formattedDate)
                .font(.system(size: 16))
                .foregroundColor(.secondary)
        }
    }
    
    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 18, weight: .semibold))
            .padding(.top, 8)
    }
    
    private func placeholderContent(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 14))
            .foregroundColor(.secondary)
            .padding(.vertical, 8)
    }
    
    private var placeholderHabits: some View {
        HStack(spacing: 12) {
            habitCircle(completed: true)
            habitCircle(completed: false)
            habitCircle(completed: false)
            Spacer()
        }
    }
    
    private func habitCircle(completed: Bool) -> some View {
        Circle()
            .fill(completed ? Color.green : Color.gray.opacity(0.3))
            .frame(width: 30, height: 30)
    }
    
    private var textEditorPlaceholder: some View {
        VStack(spacing: 0) {
            // Rahmen im Display-Stil (später verfeinern)
            TextEditor(text: $text)
                .frame(height: 100)
                .padding(8)
                .background(Color(uiColor: .systemBackground))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.gray.opacity(0.3), lineWidth: 1)
                )
                .padding(.horizontal)
                .padding(.bottom, 8)
            
            Text("Später: FocusLineTextEditor (aktive Zeile 17pt, andere 11pt)")
                .font(.caption)
                .foregroundColor(.secondary)
                .padding(.bottom, 4)
        }
    }
    
    private var formattedDate: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        formatter.dateFormat = "EEEE, d. MMMM yyyy"
        return formatter.string(from: Date())
    }
}

#Preview {
    TodayView()
}
