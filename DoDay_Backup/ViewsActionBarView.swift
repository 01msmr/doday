//
//  ActionBarView.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import SwiftUI

/// Action Bar mit 4 festen Button-Positionen
/// Buttons erscheinen kontextabhängig basierend auf TimeScope
/// Leere Positionen = komplett leerer Platzhalter (kein Icon, kein Button)
struct ActionBarView: View {
    let scope: TimeScope
    let onCreateEvent: () -> Void
    let onCreateReminder: () -> Void
    let onCreateJournal: () -> Void
    let onToggleHabit: () -> Void
    
    var body: some View {
        HStack(spacing: 0) {
            // Position 1: Termin erstellen (Heute, Morgen, Woche)
            if scope == .today || scope == .tomorrow || scope == .week {
                actionButton(
                    icon: "calendar.badge.plus",
                    label: "Termin",
                    action: onCreateEvent
                )
            } else {
                emptyPlaceholder()
            }
            
            // Position 2: Erinnerung erstellen (Heute, Morgen, Woche)
            if scope == .today || scope == .tomorrow || scope == .week {
                actionButton(
                    icon: "checkmark.circle",
                    label: "Aufgabe",
                    action: onCreateReminder
                )
            } else {
                emptyPlaceholder()
            }
            
            // Position 3: Journal/Review schreiben (immer)
            actionButton(
                icon: "book.closed",
                label: journalButtonLabel,
                action: onCreateJournal
            )
            
            // Position 4: Habit abhaken (nur Heute + Morgen)
            if scope == .today || scope == .tomorrow {
                actionButton(
                    icon: "circle.fill",
                    label: "Habit",
                    action: onToggleHabit
                )
            } else {
                emptyPlaceholder()
            }
        }
        .frame(height: 60)
        .background(Color(white: 0.96))
        .overlay(
            Rectangle()
                .fill(Color.gray.opacity(0.2))
                .frame(height: 0.5),
            alignment: .top
        )
    }
    
    /// Berechnet das Label für den Journal-Button basierend auf TimeScope
    private var journalButtonLabel: String {
        switch scope {
        case .today:
            return "Journal"
        case .tomorrow:
            return "Journal"
        case .week:
            return "Review"
        case .monthYear:
            return "Review"
        }
    }
    
    /// Erstellt einen Action-Button
    private func actionButton(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 22))
                Text(label)
                    .font(.system(size: 11))
            }
            .frame(maxWidth: .infinity)
            .foregroundColor(.primary)
        }
    }
    
    /// Leerer Platzhalter für nicht verfügbare Aktionen
    private func emptyPlaceholder() -> some View {
        Color.clear
            .frame(maxWidth: .infinity)
    }
}

#Preview("Heute") {
    ActionBarView(
        scope: .today,
        onCreateEvent: { print("Termin erstellen") },
        onCreateReminder: { print("Erinnerung erstellen") },
        onCreateJournal: { print("Journal schreiben") },
        onToggleHabit: { print("Habit abhaken") }
    )
}

#Preview("Morgen") {
    ActionBarView(
        scope: .tomorrow,
        onCreateEvent: { print("Termin erstellen") },
        onCreateReminder: { print("Erinnerung erstellen") },
        onCreateJournal: { print("Journal schreiben") },
        onToggleHabit: { print("Habit abhaken") }
    )
}

#Preview("Woche") {
    ActionBarView(
        scope: .week,
        onCreateEvent: { print("Termin erstellen") },
        onCreateReminder: { print("Erinnerung erstellen") },
        onCreateJournal: { print("Review schreiben") },
        onToggleHabit: { print("Habit abhaken") }
    )
}

#Preview("Monat/Jahr") {
    ActionBarView(
        scope: .monthYear,
        onCreateEvent: { print("Termin erstellen") },
        onCreateReminder: { print("Erinnerung erstellen") },
        onCreateJournal: { print("Review schreiben") },
        onToggleHabit: { print("Habit abhaken") }
    )
}
