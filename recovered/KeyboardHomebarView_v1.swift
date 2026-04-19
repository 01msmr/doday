//
//  KeyboardHomebarView.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import SwiftUI

/// Keyboard-Style Homebar mit 3 Tasten (unten)
/// Design: Klassische Keyboard-Tasten mit zweizeiligem Text
/// - DO DAY (Today)
/// - DO MORROW (Tomorrow/Week)
/// - MON YEAR (Month/Year)
struct KeyboardHomebarView: View {
    @Binding var selectedScope: TimeScope
    
    var body: some View {
        HStack(spacing: 8) {
            // Button 1: DO DAY (Today)
            keyboardButton(
                topText: "DO",
                bottomText: "DAY",
                isSelected: selectedScope == .today,
                action: { selectedScope = .today }
            )
            
            // Button 2: DO MORROW (Week)
            keyboardButton(
                topText: "DO",
                bottomText: "MORROW",
                isSelected: selectedScope == .week,
                action: { selectedScope = .week }
            )
            
            // Button 3: MON YEAR (Month/Year)
            keyboardButton(
                topText: "MON",
                bottomText: "YEAR",
                isSelected: selectedScope == .monthYear,
                action: { selectedScope = .monthYear }
            )
        }
        .padding(.horizontal, 12)
        .frame(height: 60)
    }
    
    // MARK: - Keyboard Button
    
    /// Erstellt einen Keyboard-Style-Button
    private func keyboardButton(
        topText: String,
        bottomText: String,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(topText)
                    .font(.system(size: 14, weight: .semibold))
                Text(bottomText)
                    .font(.system(size: 14, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .foregroundColor(isSelected ? .white : .primary)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(isSelected ? Color.blue : Color(white: 0.95))
                    .shadow(
                        color: Color.black.opacity(isSelected ? 0.3 : 0.15),
                        radius: isSelected ? 4 : 2,
                        x: 0,
                        y: isSelected ? 2 : 1
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.black.opacity(0.1), lineWidth: 0.5)
            )
        }
        .buttonStyle(KeyboardButtonStyle())
    }
}

// MARK: - Keyboard Button Style

/// Custom ButtonStyle für Keyboard-Tasten-Effekt
struct KeyboardButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .opacity(configuration.isPressed ? 0.8 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

// MARK: - Preview

#Preview("Unselected") {
    @Previewable @State var scope = TimeScope.today
    
    VStack {
        Spacer()
        KeyboardHomebarView(selectedScope: $scope)
            .background(Color(white: 0.98))
    }
}

#Preview("Week Selected") {
    @Previewable @State var scope = TimeScope.week
    
    VStack {
        Spacer()
        KeyboardHomebarView(selectedScope: $scope)
            .background(Color(white: 0.98))
    }
}

#Preview("iPhone 16") {
    @Previewable @State var scope = TimeScope.today
    @Previewable @State var text = "Test-Notiz"
    
    VStack(spacing: 0) {
        // Content-Bereich
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Heute")
                    .font(.largeTitle.bold())
                Text("Sonntag, 19. April 2026")
                    .foregroundColor(.secondary)
                
                Divider()
                
                Text("Hier kommt der Inhalt hin...")
                    .foregroundColor(.secondary)
            }
            .padding()
        }
        
        // Action-Buttons (Beispiel)
        HStack(spacing: 0) {
            Button(action: {}) {
                VStack(spacing: 4) {
                    Image(systemName: "calendar.badge.plus")
                        .font(.system(size: 22))
                    Text("Termin")
                        .font(.system(size: 11))
                }
                .frame(maxWidth: .infinity)
            }
            .foregroundColor(.primary)
            
            Button(action: {}) {
                VStack(spacing: 4) {
                    Image(systemName: "checkmark.circle")
                        .font(.system(size: 22))
                    Text("Aufgabe")
                        .font(.system(size: 11))
                }
                .frame(maxWidth: .infinity)
            }
            .foregroundColor(.primary)
        }
        .frame(height: 60)
        .background(Color(white: 0.96))
        .padding(.bottom, 8)
        
        // TextView (Placeholder)
        TextEditor(text: $text)
            .frame(height: 140)
            .padding(12)
            .background(Color.white)
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.gray.opacity(0.3), lineWidth: 1)
            )
            .padding(.horizontal, 12)
            .padding(.bottom, 12)
        
        // Keyboard-Homebar
        KeyboardHomebarView(selectedScope: $scope)
            .padding(.bottom, 8)
    }
    .background(Color(white: 0.98))
}
