//
//  KeyboardHomebarView.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import SwiftUI

/// Realistische mechanische Keycaps (High-Profile, SA/Cherry-Style)
/// Design basiert auf echten mechanischen Tastaturen (NICHT Gaming)
/// - DO DAY (Today)
/// - DO MORROW (Week)
/// - MON YEAR (Month/Year)
struct KeyboardHomebarView: View {
    @Binding var selectedScope: TimeScope
    
    var body: some View {
        GeometryReader { geometry in
            HStack(spacing: 6) {
                // Button 1: DO DAY (Today)
                MechanicalKeycap(
                    topText: "DO",
                    bottomText: "DAY",
                    isSelected: selectedScope == .today,
                    width: (geometry.size.width - 32) / 3,
                    action: { withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        selectedScope = .today
                    }}
                )
                
                // Button 2: DO MORROW (Week)
                MechanicalKeycap(
                    topText: "DO",
                    bottomText: "MORROW",
                    isSelected: selectedScope == .week,
                    width: (geometry.size.width - 32) / 3,
                    action: { withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        selectedScope = .week
                    }}
                )
                
                // Button 3: MON YEAR (Month/Year)
                MechanicalKeycap(
                    topText: "MON",
                    bottomText: "YEAR",
                    isSelected: selectedScope == .monthYear,
                    width: (geometry.size.width - 32) / 3,
                    action: { withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        selectedScope = .monthYear
                    }}
                )
            }
            .padding(.horizontal, 10)
        }
        .frame(height: 70)
    }
}

// MARK: - Mechanical Keycap Component

/// Einzelne mechanische Keycap (SA-Profile oder Cherry-Profile)
struct MechanicalKeycap: View {
    let topText: String
    let bottomText: String
    let isSelected: Bool
    let width: CGFloat
    let action: () -> Void
    
    @State private var isPressed = false
    
    var body: some View {
        Button(action: {
            isPressed = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                isPressed = false
                action()
            }
        }) {
            ZStack {
                // Keycap-Körper (High-Profile)
                keycapBody
                
                // Beschriftung
                keycapLegend
            }
        }
        .buttonStyle(PlainButtonStyle())
        .frame(width: width, height: 62)
    }
    
    // MARK: - Keycap Body
    
    /// Keycap-Körper mit realistischem 3D-Effekt
    private var keycapBody: some View {
        ZStack {
            // Bottom Shadow (Schatten unter der Taste)
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color.black.opacity(0.25))
                .offset(y: isPressed ? 1 : 3)
                .blur(radius: isPressed ? 2 : 4)
            
            // Base (Basis der Taste)
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Color(white: isSelected ? 0.3 : 0.18),
                            Color(white: isSelected ? 0.25 : 0.14)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .offset(y: isPressed ? 1 : 2)
            
            // Top Surface (Oberfläche der Taste)
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: keycapColors,
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay(
                    // Top Highlight (Glanzeffekt oben)
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color.white.opacity(isSelected ? 0.25 : 0.18),
                                    Color.clear
                                ],
                                startPoint: .top,
                                endPoint: .center
                            )
                        )
                )
                .overlay(
                    // Subtle Inner Shadow
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .strokeBorder(
                            LinearGradient(
                                colors: [
                                    Color.black.opacity(0.2),
                                    Color.clear
                                ],
                                startPoint: .top,
                                endPoint: .bottom
                            ),
                            lineWidth: 0.5
                        )
                )
                .shadow(color: Color.white.opacity(isSelected ? 0.15 : 0.08), radius: 1, x: 0, y: -0.5)
                .padding(3)
                .offset(y: isPressed ? 1.5 : 0)
        }
    }
    
    /// Keycap-Farben basierend auf Selection-Status
    private var keycapColors: [Color] {
        if isSelected {
            // Selected: Warmes Beige/Creme (wie GMK Oblivion oder ePBT Ivory)
            return [
                Color(red: 0.92, green: 0.89, blue: 0.82),
                Color(red: 0.88, green: 0.85, blue: 0.78)
            ]
        } else {
            // Unselected: Klassisches Grau (wie Cherry Dyesub)
            return [
                Color(white: 0.82),
                Color(white: 0.76)
            ]
        }
    }
    
    // MARK: - Keycap Legend (Beschriftung)
    
    /// Beschriftung im Stil echter Keycaps (Dyesub oder Doubleshot)
    private var keycapLegend: some View {
        VStack(spacing: 1) {
            Text(topText)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .tracking(0.5)
            
            Text(bottomText)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .tracking(bottomText == "MORROW" ? -0.3 : 0.5)
        }
        .foregroundStyle(
            LinearGradient(
                colors: [
                    Color(white: isSelected ? 0.25 : 0.35),
                    Color(white: isSelected ? 0.20 : 0.30)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .shadow(color: Color.white.opacity(0.5), radius: 0.5, x: 0, y: 0.5)
        .offset(y: isPressed ? 1.5 : 0)
    }
}

// MARK: - Previews

#Preview("All States") {
    VStack(spacing: 20) {
        // Unselected
        KeyboardHomebarView(selectedScope: .constant(.week))
            .background(Color(white: 0.15))
        
        // Today Selected
        KeyboardHomebarView(selectedScope: .constant(.today))
            .background(Color(white: 0.15))
        
        // MonthYear Selected
        KeyboardHomebarView(selectedScope: .constant(.monthYear))
            .background(Color(white: 0.15))
    }
    .padding()
    .background(Color(white: 0.12))
}

#Preview("iPhone 16 - Full Layout") {
    @Previewable @State var scope = TimeScope.today
    @Previewable @State var text = "Notiz hier eingeben..."
    
    VStack(spacing: 0) {
        // Content-Bereich
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Heute")
                    .font(.system(size: 32, weight: .bold))
                Text("Sonntag, 19. April 2026")
                    .font(.system(size: 16))
                    .foregroundColor(.secondary)
                
                Divider()
                
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Image(systemName: "calendar")
                            .foregroundColor(.blue)
                        Text("14:00 Arzttermin")
                    }
                    HStack {
                        Image(systemName: "checkmark.circle")
                            .foregroundColor(.green)
                        Text("Einkaufen")
                    }
                    
                    Text("Habits")
                        .font(.headline)
                        .padding(.top, 8)
                    
                    HStack(spacing: 12) {
                        Circle()
                            .fill(Color.green.opacity(0.3))
                            .frame(width: 36, height: 36)
                            .overlay(Circle().stroke(Color.green, lineWidth: 2))
                        Circle()
                            .fill(Color.gray.opacity(0.2))
                            .frame(width: 36, height: 36)
                        Circle()
                            .fill(Color.gray.opacity(0.2))
                            .frame(width: 36, height: 36)
                    }
                }
                .padding(.vertical, 8)
            }
            .padding()
        }
        .background(Color(uiColor: .systemBackground))
        
        // Action-Buttons
        HStack(spacing: 0) {
            actionButton(icon: "calendar.badge.plus", label: "Termin")
            actionButton(icon: "checkmark.circle", label: "Aufgabe")
            actionButton(icon: "book.closed", label: "Journal")
            actionButton(icon: "circle.fill", label: "Habit")
        }
        .frame(height: 60)
        .background(Color(white: 0.96))
        .overlay(Rectangle().fill(Color.gray.opacity(0.2)).frame(height: 0.5), alignment: .top)
        .padding(.bottom, 8)
        
        // TextView (Placeholder)
        TextEditor(text: $text)
            .frame(height: 140)
            .padding(12)
            .background(Color(uiColor: .systemBackground))
            .cornerRadius(8)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.gray.opacity(0.3), lineWidth: 1))
            .padding(.horizontal, 12)
            .padding(.bottom, 12)
        
        // Mechanical Keycaps Homebar
        KeyboardHomebarView(selectedScope: $scope)
            .background(Color(white: 0.15))
            .padding(.bottom, 8)
    }
    .background(Color(white: 0.98))
}

// MARK: - Helper

private func actionButton(icon: String, label: String) -> some View {
    VStack(spacing: 4) {
        Image(systemName: icon)
            .font(.system(size: 22))
        Text(label)
            .font(.system(size: 11))
    }
    .frame(maxWidth: .infinity)
    .foregroundColor(.primary)
}
