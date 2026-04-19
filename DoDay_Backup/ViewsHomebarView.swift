//
//  HomebarView.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import SwiftUI

/// Homebar mit 3 Buttons für Zeitraum-Auswahl
/// Proportionen: Heute (50%), Woche (25%), Monat/Jahr (25%)
struct HomebarView: View {
    @Binding var selectedScope: TimeScope
    
    var body: some View {
        GeometryReader { geometry in
            HStack(spacing: 0) {
                // Button 1: Heute (50% Breite)
                Button(action: {
                    selectedScope = .today
                }) {
                    Text("HEUTE")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(selectedScope == .today ? .white : .primary)
                        .frame(width: geometry.size.width * 0.5, height: 50)
                        .background(selectedScope == .today ? Color.blue : Color.gray.opacity(0.2))
                        .cornerRadius(8)
                }
                
                // Button 2: Woche (25% Breite)
                Button(action: {
                    selectedScope = .week
                }) {
                    Text("WOCHE")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(selectedScope == .week ? .white : .primary)
                        .frame(width: geometry.size.width * 0.25, height: 50)
                        .background(selectedScope == .week ? Color.blue : Color.gray.opacity(0.2))
                        .cornerRadius(8)
                }
                
                // Button 3: Monat/Jahr (25% Breite)
                Button(action: {
                    selectedScope = .monthYear
                }) {
                    Text("M/J")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(selectedScope == .monthYear ? .white : .primary)
                        .frame(width: geometry.size.width * 0.25, height: 50)
                        .background(selectedScope == .monthYear ? Color.blue : Color.gray.opacity(0.2))
                        .cornerRadius(8)
                }
            }
            .padding(.horizontal, 4)
        }
        .frame(height: 60)
    }
}

#Preview {
    @Previewable @State var scope = TimeScope.today
    
    VStack {
        HomebarView(selectedScope: $scope)
        Spacer()
    }
}
