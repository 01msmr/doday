//
//  TomorrowView.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import SwiftUI

/// Ansicht für morgen (DO MORROW)
/// Zeigt Termine, Aufgaben und Habits für den nächsten Tag
struct TomorrowView: View {
    @State private var tomorrowDate = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Header mit Datum
                VStack(alignment: .leading, spacing: 4) {
                    Text("Morgen")
                        .font(.system(size: 32, weight: .bold))
                    Text(tomorrowDate, style: .date)
                        .font(.system(size: 16))
                        .foregroundColor(.secondary)
                }
                
                Divider()
                
                // Placeholder-Inhalte
                VStack(alignment: .leading, spacing: 12) {
                    Text("Termine")
                        .font(.headline)
                    
                    emptyEntryPlaceholder
                    
                    Text("Aufgaben")
                        .font(.headline)
                        .padding(.top, 8)
                    
                    emptyEntryPlaceholder
                    
                    Text("Habits")
                        .font(.headline)
                        .padding(.top, 8)
                    
                    HStack(spacing: 12) {
                        habitCircle(completed: false)
                        Spacer()
                    }
                }
            }
            .padding()
        }
    }
    
    // MARK: - Helper Views
    
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
            .frame(width: 36, height: 36)
    }
}

#Preview("TomorrowView") {
    TomorrowView()
}
