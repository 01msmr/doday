//
//  MonthYearView.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import SwiftUI

/// Monats-/Jahresansicht (25% Breite in Homebar)
/// Feature: Toggle zwischen Monats- und Jahresansicht
struct MonthYearView: View {
    @State private var showingYear: Bool = false // false = Monat, true = Jahr
    @State private var text: String = ""
    
    var body: some View {
        VStack(spacing: 0) {
            // Inhaltsbereich
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Header mit Toggle
                    headerWithToggle
                    
                    // Inhalt basierend auf Modus
                    if showingYear {
                        yearContent
                    } else {
                        monthContent
                    }
                }
                .padding()
            }
            
            Spacer()
            
            // Textfeld (Platzhalter)
            textEditorPlaceholder
        }
    }
    
    // MARK: - Header
    
    private var headerWithToggle: some View {
        VStack(spacing: 12) {
            // Toggle-Schalter
            Picker("Ansicht", selection: $showingYear) {
                Text("Monat").tag(false)
                Text("Jahr").tag(true)
            }
            .pickerStyle(.segmented)
            
            // Titel
            Text(showingYear ? yearTitle : monthTitle)
                .font(.system(size: 28, weight: .bold))
        }
    }
    
    // MARK: - Monatsansicht
    
    private var monthContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Ereignisse im \(monthName)")
            placeholderContent("Keine Ereignisse in diesem Monat")
            
            sectionHeader("Monatsreview")
            placeholderContent("Noch kein Review verfasst")
        }
    }
    
    // MARK: - Jahresansicht
    
    private var yearContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Jahresübersicht \(yearNumber)")
            placeholderContent("Keine Jahresübersicht verfügbar")
            
            sectionHeader("Jahresreview")
            placeholderContent("Noch kein Review verfasst")
        }
    }
    
    // MARK: - Hilfskomponenten
    
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
                .background(adaptiveBackgroundColor)
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
    
    private var monthTitle: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        formatter.dateFormat = "MMMM yyyy"
        return formatter.string(from: Date())
    }
    
    private var yearTitle: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy"
        return formatter.string(from: Date())
    }
    
    private var monthName: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        formatter.dateFormat = "MMMM"
        return formatter.string(from: Date())
    }
    
    private var yearNumber: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy"
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

#Preview("Monatsansicht") {
    MonthYearView()
}

#Preview("Jahresansicht") {
    @Previewable @State var view = MonthYearView()
    view
}
