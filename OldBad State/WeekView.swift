//
//  WeekView.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import SwiftUI

/// Wochenansicht (25% Breite in Homebar)
/// Features: Events der Woche, Swipe links → nächste Woche
struct WeekView: View {
    @State private var currentWeekOffset: Int = 0 // 0 = diese Woche, 1 = nächste, -1 = letzte
    @State private var text: String = ""
    
    var body: some View {
        VStack(spacing: 0) {
            // Inhaltsbereich mit Swipe-Geste
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Header mit Wochennummer und Navigation
                    weekHeader
                    
                    // Kalender-Events der Woche (später via CalendarService)
                    sectionHeader("Termine diese Woche")
                    placeholderContent("Keine Termine diese Woche")
                    
                    // Erinnerungen der Woche
                    sectionHeader("Erinnerungen")
                    placeholderContent("Keine Erinnerungen diese Woche")
                }
                .padding()
            }
            .gesture(
                DragGesture()
                    .onEnded { gesture in
                        // Swipe nach links = nächste Woche
                        if gesture.translation.width < -50 {
                            currentWeekOffset += 1
                        }
                        // Swipe nach rechts = vorherige Woche
                        else if gesture.translation.width > 50 {
                            currentWeekOffset -= 1
                        }
                    }
            )
            
            Spacer()
            
            // Textfeld (Platzhalter)
            textEditorPlaceholder
        }
    }
    
    // MARK: - Hilfskomponenten
    
    private var weekHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Button(action: { currentWeekOffset -= 1 }) {
                    Image(systemName: "chevron.left")
                }
                
                Spacer()
                
                VStack {
                    Text("Woche \(weekNumber)")
                        .font(.system(size: 24, weight: .bold))
                    Text(weekDateRange)
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)
                }
                
                Spacer()
                
                Button(action: { currentWeekOffset += 1 }) {
                    Image(systemName: "chevron.right")
                }
            }
            
            if currentWeekOffset != 0 {
                Button(action: { currentWeekOffset = 0 }) {
                    Text("Zurück zu dieser Woche")
                        .font(.caption)
                        .foregroundColor(.blue)
                }
            }
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
    
    private var textEditorPlaceholder: some View {
        VStack(spacing: 0) {
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
            
            Text("Später: FocusLineTextEditor")
                .font(.caption)
                .foregroundColor(.secondary)
                .padding(.bottom, 4)
        }
    }
    
    // MARK: - Berechnungen
    
    private var targetDate: Date {
        let calendar = Calendar.current
        return calendar.date(byAdding: .weekOfYear, value: currentWeekOffset, to: Date()) ?? Date()
    }
    
    private var weekNumber: Int {
        let calendar = Calendar.current
        return calendar.component(.weekOfYear, from: targetDate)
    }
    
    private var weekDateRange: String {
        let calendar = Calendar.current
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        formatter.dateFormat = "d. MMM"
        
        // Wochenstart (Montag)
        let weekday = calendar.component(.weekday, from: targetDate)
        let daysToMonday = (weekday == 1) ? -6 : -(weekday - 2)
        let monday = calendar.date(byAdding: .day, value: daysToMonday, to: targetDate) ?? targetDate
        
        // Wochenende (Sonntag)
        let sunday = calendar.date(byAdding: .day, value: 6, to: monday) ?? targetDate
        
        return "\(formatter.string(from: monday)) – \(formatter.string(from: sunday))"
    }
}

#Preview {
    WeekView()
}
