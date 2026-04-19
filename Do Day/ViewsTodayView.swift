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
                    emptyEntryPlaceholder
                    
                    // Habits (später via HabitService)
                    sectionHeader("Habits")
                    placeholderHabits
                    
                    // Erinnerungen (später via ReminderService)
                    sectionHeader("Erinnerungen")
                    emptyEntryPlaceholder
                    
                    // Journal/Notes Text Field
                    sectionHeader("Notizen")
                    FocusLineTextEditor(text: $text)
                        .frame(height: 200)
                }
                .padding()
            }
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
            // Show one empty circle by default
            habitCircle(completed: false)
            Spacer()
        }
    }
    
    private var emptyEntryPlaceholder: some View {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
            .stroke(Color.gray.opacity(0.3), lineWidth: 1)
            .frame(height: 32)
            .padding(.vertical, 4)
    }
    
    private func habitCircle(completed: Bool) -> some View {
        Circle()
            .stroke(Color.gray.opacity(0.3), lineWidth: 1)
            .background(
                Circle()
                    .fill(completed ? Color.green.opacity(0.3) : Color.clear)
            )
            .frame(width: 30, height: 30)
    }
    
    private var formattedDate: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        formatter.dateFormat = "EEEE, d. MMMM yyyy"
        return formatter.string(from: Date())
    }
    
    // MARK: - Plattformübergreifende Farben
    
    /// Adaptiver Hintergrund für alle Plattformen
    private var adaptiveBackgroundColor: Color {
        #if canImport(UIKit)
        return Color(uiColor: .systemBackground)
        #elseif canImport(AppKit)
        return Color(nsColor: .windowBackgroundColor)
        #else
        return Color.white
        #endif
    }
}

#Preview {
    TodayView()
}
