//
//  StorageService.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import Foundation
import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

/// Service für Ordner-Auswahl und Datenspeicherung
/// Synchronisiert Ordner-Pfad via iCloud (NSUbiquitousKeyValueStore)
@MainActor
class StorageService: ObservableObject {
    static let shared = StorageService()
    
    @Published var storageFolderURL: URL?
    @Published var isConfigured: Bool = false
    
    private let folderBookmarkKey = "storageFolderBookmark"
    private let iCloudStore = NSUbiquitousKeyValueStore.default
    
    private init() {
        loadStorageFolder()
        setupiCloudSync()
    }
    
    // MARK: - Folder Selection
    
    /// Zeigt Ordner-Auswahl-Dialog (iOS DocumentPicker / macOS NSOpenPanel)
    func selectStorageFolder(completion: @escaping (URL?) -> Void) {
        #if canImport(UIKit)
        selectFolderiOS(completion: completion)
        #elseif canImport(AppKit)
        selectFolderMac(completion: completion)
        #endif
    }
    
    #if canImport(UIKit)
    private func selectFolderiOS(completion: @escaping (URL?) -> Void) {
        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = windowScene.windows.first,
              let rootVC = window.rootViewController else {
            completion(nil)
            return
        }
        
        let documentPicker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
        documentPicker.allowsMultipleSelection = false
        documentPicker.directoryURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        
        // Create a coordinator to handle the result
        let coordinator = DocumentPickerCoordinator { [weak self] url in
            if let url = url {
                self?.saveStorageFolder(url)
                completion(url)
            } else {
                completion(nil)
            }
        }
        
        documentPicker.delegate = coordinator
        
        // Keep coordinator alive
        objc_setAssociatedObject(documentPicker, "coordinator", coordinator, .OBJC_ASSOCIATION_RETAIN)
        
        rootVC.present(documentPicker, animated: true)
    }
    #endif
    
    #if canImport(AppKit)
    private func selectFolderMac(completion: @escaping (URL?) -> Void) {
        let openPanel = NSOpenPanel()
        openPanel.canChooseFiles = false
        openPanel.canChooseDirectories = true
        openPanel.allowsMultipleSelection = false
        openPanel.canCreateDirectories = true
        openPanel.prompt = "Auswählen"
        openPanel.message = "Wähle einen Ordner für Do Day Daten"
        
        openPanel.begin { [weak self] response in
            if response == .OK, let url = openPanel.url {
                self?.saveStorageFolder(url)
                completion(url)
            } else {
                completion(nil)
            }
        }
    }
    #endif
    
    // MARK: - Persistence & Sync
    
    private func saveStorageFolder(_ url: URL) {
        // Create security-scoped bookmark
        do {
            let bookmarkData = try url.bookmarkData(
                options: .minimalBookmark,
                includingResourceValuesForKeys: nil,
                relativeTo: nil
            )
            
            // Save locally
            UserDefaults.standard.set(bookmarkData, forKey: folderBookmarkKey)
            
            // Sync via iCloud
            iCloudStore.set(bookmarkData, forKey: folderBookmarkKey)
            iCloudStore.synchronize()
            
            // Update state
            storageFolderURL = url
            isConfigured = true
            
        } catch {
            print("Error creating bookmark: \(error)")
        }
    }
    
    private func loadStorageFolder() {
        // Try to load from UserDefaults first
        if let bookmarkData = UserDefaults.standard.data(forKey: folderBookmarkKey) {
            resolveBookmark(bookmarkData)
        }
        // If not found locally, try iCloud
        else if let bookmarkData = iCloudStore.data(forKey: folderBookmarkKey) {
            resolveBookmark(bookmarkData)
        }
    }
    
    private func resolveBookmark(_ bookmarkData: Data) {
        do {
            var isStale = false
            let url = try URL(
                resolvingBookmarkData: bookmarkData,
                options: .withoutUI,
                relativeTo: nil,
                bookmarkDataIsStale: &isStale
            )
            
            if isStale {
                // Recreate bookmark
                saveStorageFolder(url)
            } else {
                storageFolderURL = url
                isConfigured = true
            }
            
        } catch {
            print("Error resolving bookmark: \(error)")
        }
    }
    
    private func setupiCloudSync() {
        // Listen for iCloud changes
        NotificationCenter.default.addObserver(
            forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: iCloudStore,
            queue: .main
        ) { [weak self] _ in
            self?.loadStorageFolder()
        }
    }
    
    // MARK: - File Operations
    
    /// Erstellt oder aktualisiert eine Datei im Storage-Ordner
    func saveFile(named fileName: String, content: String) throws {
        guard let folderURL = storageFolderURL else {
            throw StorageError.noFolderSelected
        }
        
        let fileURL = folderURL.appendingPathComponent(fileName)
        try content.write(to: fileURL, atomically: true, encoding: .utf8)
    }
    
    /// Liest eine Datei aus dem Storage-Ordner
    func loadFile(named fileName: String) throws -> String {
        guard let folderURL = storageFolderURL else {
            throw StorageError.noFolderSelected
        }
        
        let fileURL = folderURL.appendingPathComponent(fileName)
        return try String(contentsOf: fileURL, encoding: .utf8)
    }
}

// MARK: - Document Picker Coordinator (iOS)

#if canImport(UIKit)
class DocumentPickerCoordinator: NSObject, UIDocumentPickerDelegate {
    let completion: (URL?) -> Void
    
    init(completion: @escaping (URL?) -> Void) {
        self.completion = completion
    }
    
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        completion(urls.first)
    }
    
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        completion(nil)
    }
}
#endif

// MARK: - Errors

enum StorageError: Error, LocalizedError {
    case noFolderSelected
    
    var errorDescription: String? {
        switch self {
        case .noFolderSelected:
            return "Kein Speicherort ausgewählt. Bitte wähle einen Ordner in den Einstellungen."
        }
    }
}
