//
//  StorageSetupView.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import SwiftUI

/// Erste Ansicht beim App-Start: Ordner-Auswahl für Datenspeicherung
struct StorageSetupView: View {
    @ObservedObject var storageService = StorageService.shared
    @State private var isSelecting = false
    
    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            
            // Icon
            Image(systemName: "folder.badge.plus")
                .font(.system(size: 72))
                .foregroundColor(.blue)
            
            // Title
            Text("Willkommen bei Do Day")
                .font(.system(size: 32, weight: .bold))
            
            // Description
            Text("Wähle einen Ordner, in dem deine Notizen, Termine und Habits gespeichert werden sollen.")
                .font(.system(size: 17))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            
            // iCloud Sync Info
            HStack(spacing: 8) {
                Image(systemName: "icloud")
                    .foregroundColor(.blue)
                Text("Der Ordner-Pfad wird über iCloud auf all deinen Geräten synchronisiert")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 32)
            
            Spacer()
            
            // Select Button
            Button(action: {
                isSelecting = true
                storageService.selectStorageFolder { url in
                    isSelecting = false
                    if url != nil {
                        // Folder selected, service will update automatically
                    }
                }
            }) {
                HStack {
                    Image(systemName: "folder")
                    Text("Ordner auswählen")
                }
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(Color.blue)
                .cornerRadius(12)
            }
            .disabled(isSelecting)
            .padding(.horizontal, 32)
            .padding(.bottom, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(adaptiveBackgroundColor)
    }
    
    // MARK: - Platform-specific Colors
    
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
    StorageSetupView()
}
