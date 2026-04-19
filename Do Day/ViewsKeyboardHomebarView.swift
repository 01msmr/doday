//
//  KeyboardHomebarView.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import SwiftUI

/// Keyboard-Style Homebar mit mechanischen Keycap-Buttons
/// Design: Realistische mechanische Tastatur (Cherry MX Profile)
/// Layout: [DO DAY | DO MORROW] 50% [WEEK] 25% [MON YEAR] 25%
/// Based on actual Cherry MX keycap profile (~11-12mm height, proper 3D rendering)
struct KeyboardHomebarView_Old: View {
    @Binding var selectedScope: TimeScope
    
    var body: some View {
        GeometryReader { geometry in
            let totalWidth = geometry.size.width - 20 // padding
            let spacing: CGFloat = 6
            let combinedWidth = (totalWidth - spacing * 2) * 0.5
            let singleWidth = (totalWidth - spacing * 2) * 0.25
            
            HStack(spacing: spacing) {
                // Button 1: Combined DO DAY | DO MORROW (50% width, toggles between today/week)
                dualKeycapButton(width: combinedWidth)
                
                // Button 2: WEEK (25% width)
                singleKeycapButton(
                    topText: "WEEK",
                    bottomText: "",
                    width: singleWidth,
                    isSelected: selectedScope == .week,
                    action: { 
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            selectedScope = .week
                        }
                    }
                )
                
                // Button 3: MON YEAR (25% width)
                singleKeycapButton(
                    topText: "MON",
                    bottomText: "YEAR",
                    width: singleWidth,
                    isSelected: selectedScope == .monthYear,
                    action: { 
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            selectedScope = .monthYear
                        }
                    }
                )
            }
            .padding(.horizontal, 10)
        }
        .frame(height: 70)
        .background(
            LinearGradient(
                colors: [Color(white: 0.18), Color(white: 0.12)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }
    
    // MARK: - Dual Keycap Button (DO DAY | DO MORROW)
    
    /// Combined button (50% width) with DO DAY (left) and DO MORROW (right)
    /// Toggles between Today and Week
    private func dualKeycapButton(width: CGFloat) -> some View {
        Button(action: toggleTodayWeek) {
            HStack(spacing: 0) {
                // Left side: DO DAY (Today)
                VStack(spacing: 1) {
                    Text("DO")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                    Text("DAY")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                }
                .frame(maxWidth: .infinity)
                .foregroundStyle(
                    LinearGradient(
                        colors: selectedScope == .today ? [
                            Color(white: 0.25),
                            Color(white: 0.20)
                        ] : [
                            Color(white: 0.35),
                            Color(white: 0.30)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                
                // Divider line
                Rectangle()
                    .fill(Color.black.opacity(0.4))
                    .frame(width: 1)
                    .padding(.vertical, 8)
                
                // Right side: DO MORROW (Week - but labeled as tomorrow concept)
                VStack(spacing: 0) {
                    Text("DO")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                    Text("MORROW")
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .tracking(-0.4) // Tighter tracking for longer word
                }
                .frame(maxWidth: .infinity)
                .foregroundStyle(
                    LinearGradient(
                        colors: selectedScope == .week ? [
                            Color(white: 0.25),
                            Color(white: 0.20)
                        ] : [
                            Color(white: 0.35),
                            Color(white: 0.30)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
            }
            .frame(width: width, height: 62)
            .background(keycapGradient(isSelected: selectedScope == .today || selectedScope == .week))
            .overlay(keycapHighlight())
            .overlay(
                // Inner shadow
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
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .shadow(color: .black.opacity(0.25), radius: 4, x: 0, y: 3)
        }
        .buttonStyle(KeycapButtonStyle())
    }
    
    /// Toggle zwischen Today und Week beim Tap auf Dual-Button
    private func toggleTodayWeek() {
        if selectedScope == .today {
            selectedScope = .week
        } else {
            selectedScope = .today
        }
    }
    
    // MARK: - Single Keycap Button
    
    /// Single keycap button (25% width) - realistic Cherry MX profile
    private func singleKeycapButton(
        topText: String,
        bottomText: String,
        width: CGFloat,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 1) {
                Text(topText)
                    .font(.system(size: 13, weight: .medium, design: .rounded))
                    .tracking(0.5)
                if !bottomText.isEmpty {
                    Text(bottomText)
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .tracking(0.5)
                }
            }
            .frame(width: width, height: 62)
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
            .background(keycapGradient(isSelected: isSelected))
            .overlay(keycapHighlight())
            .overlay(
                // Inner shadow
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
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .shadow(color: .black.opacity(0.25), radius: 4, x: 0, y: 3)
            .shadow(color: Color.white.opacity(isSelected ? 0.15 : 0.08), radius: 1, x: 0, y: -0.5)
        }
        .buttonStyle(KeycapButtonStyle())
    }
    
    // MARK: - Keycap Styling (Realistic Cherry MX Profile)
    
    /// Realistic keycap gradient based on actual Cherry MX ABS/PBT keycaps
    /// Researched from GMK, ePBT, and Cherry original keycaps
    private func keycapGradient(isSelected: Bool) -> some View {
        LinearGradient(
            colors: isSelected ? [
                // Selected: Warm beige/cream (like GMK Oblivion or ePBT Ivory)
                Color(red: 0.92, green: 0.89, blue: 0.82),
                Color(red: 0.88, green: 0.85, blue: 0.78)
            ] : [
                // Unselected: Classic gray (like Cherry Dyesub)
                Color(white: 0.82),
                Color(white: 0.76)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
    
    /// Top highlight effect (simulates light reflection on real keycaps)
    private func keycapHighlight() -> some View {
        VStack {
            LinearGradient(
                colors: [
                    Color.white.opacity(0.25),
                    Color.clear
                ],
                startPoint: .top,
                endPoint: .center
            )
            .frame(height: 16)
            Spacer()
        }
    }
}

// MARK: - Keycap Button Style

/// Custom ButtonStyle für mechanische Keycaps (Press-Effekt)
struct KeycapButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1.0)
            .offset(y: configuration.isPressed ? 2 : 0)
            .shadow(color: .black.opacity(configuration.isPressed ? 0.3 : 0.5), 
                   radius: configuration.isPressed ? 1 : 3, 
                   x: 0, 
                   y: configuration.isPressed ? 1 : 3)
            .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
    }
}

// MARK: - Preview

#Preview("Keycaps - Today Selected") {
    @Previewable @State var scope = TimeScope.today
    
    VStack {
        Spacer()
        KeyboardHomebarView_Old(selectedScope: $scope)
    }
    .background(Color.black)
}

#Preview("Keycaps - Week Selected") {
    @Previewable @State var scope = TimeScope.week
    
    VStack {
        Spacer()
        KeyboardHomebarView_Old(selectedScope: $scope)
    }
    .background(Color.black)
}

#Preview("iPhone 16 Pro - Full Layout") {
    @Previewable @State var scope = TimeScope.today
    @Previewable @State var text = "Notiz-Text hier..."
    
    VStack(spacing: 0) {
        // Content-Bereich
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Heute")
                    .font(.largeTitle.bold())
                Text("Sonntag, 19. April 2026")
                    .foregroundColor(.secondary)
                
                Divider()
                
                ForEach(0..<5) { _ in
                    HStack {
                        Circle()
                            .fill(Color.green)
                            .frame(width: 8, height: 8)
                        Text("Beispiel-Event")
                            .font(.body)
                        Spacer()
                        Text("14:00")
                            .foregroundColor(.secondary)
                            .font(.caption)
                    }
                    .padding(.vertical, 4)
                }
            }
            .padding()
        }
        
        // Action-Buttons
        HStack(spacing: 0) {
            ForEach(["📅", "✓", "📓", "●"], id: \.self) { icon in
                Button(action: {}) {
                    VStack(spacing: 4) {
                        Text(icon)
                            .font(.system(size: 22))
                        Text("Action")
                            .font(.system(size: 10))
                    }
                    .frame(maxWidth: .infinity)
                }
                .foregroundColor(.primary)
            }
        }
        .frame(height: 60)
        .background(Color(white: 0.96))
        .padding(.bottom, 8)
        
        // TextView
        TextEditor(text: $text)
            .frame(height: 120)
            .padding(12)
            .background(Color.white)
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.gray.opacity(0.3), lineWidth: 1)
            )
            .padding(.horizontal, 12)
            .padding(.bottom, 12)
        
        // Mechanische Keycaps
        KeyboardHomebarView_Old(selectedScope: $scope)
    }
    .previewDevice(PreviewDevice(rawValue: "iPhone 16 Pro"))
}
