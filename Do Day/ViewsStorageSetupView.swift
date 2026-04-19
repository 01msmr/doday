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
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 32)
            
            // iCloud Sync Info
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .center, spacing: 12) {
                    Image(systemName: "gearshape")
                        .foregroundColor(.blue)
                        .frame(width: 16)
                    Text("Der Speicherort und Deine Einstellungen werden über iCloud synchronisiert.")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.leading)
                }
                HStack(alignment: .center, spacing: 12) {
                    Image(systemName: "icloud")
                        .foregroundColor(.blue)
                        .frame(width: 16)
                    Text("Die Daten werden aber in dem von Dir gewählten Cloud-Dienst gespeichert.")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.leading)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
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
            
            // Create DO Day App Folder Button
            Button(action: {
                isSelecting = true
                createDODayAppFolder()
            }) {
                HStack {
                    Image(systemName: "folder.badge.plus")
                    Text("Ordner 'DO Day App' erstellen")
                }
                .font(.system(size: 17, weight: .regular))
                .foregroundColor(.blue)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(Color.blue.opacity(0.1))
                .cornerRadius(12)
            }
            .disabled(isSelecting)
            .padding(.horizontal, 32)
            .padding(.bottom, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(adaptiveBackgroundColor)
    }
    
    // MARK: - Actions
    
    private func createDODayAppFolder() {
        #if canImport(UIKit)
        createDODayAppFolderiOS()
        #elseif canImport(AppKit)
        createDODayAppFolderMac()
        #endif
    }
    
    #if canImport(UIKit)
    private func createDODayAppFolderiOS() {
        // On iOS, create folder in Documents and then select it
        let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let doDayAppURL = documentsURL.appendingPathComponent("DO Day App")
        
        // Create the folder
        do {
            try FileManager.default.createDirectory(at: doDayAppURL, withIntermediateDirectories: true)
            // Automatically save it as storage location
            storageService.saveStorageFolder(doDayAppURL)
            isSelecting = false
        } catch {
            print("Error creating DO Day App folder: \(error)")
            isSelecting = false
        }
    }
    #endif
    
    #if canImport(AppKit)
    private func createDODayAppFolderMac() {
        let savePanel = NSSavePanel()
        savePanel.canCreateDirectories = true
        savePanel.directoryURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        savePanel.nameFieldStringValue = "DO Day App"
        savePanel.prompt = "Erstellen"
        savePanel.message = "Wähle einen Speicherort für den 'DO Day App' Ordner"
        
        savePanel.begin { response in
            self.isSelecting = false
            if response == .OK, let url = savePanel.url {
                // Create the folder
                do {
                    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
                    // Save it as storage location
                    self.storageService.saveStorageFolder(url)
                } catch {
                    print("Error creating DO Day App folder: \(error)")
                }
            }
        }
    }
    #endif
    
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
