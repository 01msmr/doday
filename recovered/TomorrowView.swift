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
                    
                    HStack {
                        Image(systemName: "calendar")
                            .foregroundColor(.blue)
                        Text("Noch keine Termine")
                            .foregroundColor(.secondary)
                    }
                    
                    Text("Aufgaben")
                        .font(.headline)
                        .padding(.top, 8)
                    
                    HStack {
                        Image(systemName: "checkmark.circle")
                            .foregroundColor(.green)
                        Text("Noch keine Aufgaben")
                            .foregroundColor(.secondary)
                    }
                    
                    Text("Habits")
                        .font(.headline)
                        .padding(.top, 8)
                    
                    HStack(spacing: 12) {
                        Circle()
                            .fill(Color.gray.opacity(0.2))
                            .frame(width: 36, height: 36)
                        Circle()
                            .fill(Color.gray.opacity(0.2))
                            .frame(width: 36, height: 36)
                        Circle()
                            .fill(Color.gray.opacity(0.2))
                            .frame(width: 36, height: 36)
                    }
                }
            }
            .padding()
        }
    }
}

#Preview("TomorrowView") {
    TomorrowView()
}
