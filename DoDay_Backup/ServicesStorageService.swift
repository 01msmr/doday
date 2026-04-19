//
//  StorageService.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import Foundation
import SwiftUI
import Combine
import UniformTypeIdentifiers

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
    
    func saveStorageFolder(_ url: URL) {
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
    
    /// Erstellt die Ordnerstruktur im Storage-Ordner
    func createFolderStructure() throws {
        guard let folderURL = storageFolderURL else {
            throw StorageError.noFolderSelected
        }
        
        let fileManager = FileManager.default
        
        // Create Daily folder
        let dailyURL = folderURL.appendingPathComponent("Daily")
        try fileManager.createDirectory(at: dailyURL, withIntermediateDirectories: true)
        
        // Create Weekly folder
        let weeklyURL = folderURL.appendingPathComponent("Weekly")
        try fileManager.createDirectory(at: weeklyURL, withIntermediateDirectories: true)
    }
    
    /// Speichert einen Journal-Eintrag
    func saveJournalEntry(_ entry: JournalEntry) throws {
        guard let folderURL = storageFolderURL else {
            throw StorageError.noFolderSelected
        }
        
        // Ensure folders exist
        try createFolderStructure()
        
        // Build full file path
        let fileURL = folderURL
            .appendingPathComponent(entry.folderPath)
            .appendingPathComponent(entry.fileName)
        
        // Write markdown content
        try entry.fullMarkdown.write(to: fileURL, atomically: true, encoding: .utf8)
    }
    
    /// Lädt einen Journal-Eintrag
    func loadJournalEntry(for scope: TimeScope, date: Date = Date()) throws -> JournalEntry {
        guard let folderURL = storageFolderURL else {
            throw StorageError.noFolderSelected
        }
        
        // Create temporary entry to get file path
        let tempEntry = JournalEntry(scope: scope, content: "")
        let fileURL = folderURL
            .appendingPathComponent(tempEntry.folderPath)
            .appendingPathComponent(tempEntry.fileName)
        
        // Check if file exists
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            // Return empty entry if file doesn't exist
            return JournalEntry(scope: scope, content: "", tags: [])
        }
        
        // Read content
        let markdown = try String(contentsOf: fileURL, encoding: .utf8)
        
        // Parse frontmatter and content (simple implementation)
        let content = parseMarkdownContent(markdown)
        let tags = parseMarkdownTags(markdown)
        
        return JournalEntry(scope: scope, content: content, tags: tags)
    }
    
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
    
    // MARK: - Markdown Parsing Helpers
    
    private func parseMarkdownContent(_ markdown: String) -> String {
        // Remove frontmatter and return content
        let components = markdown.components(separatedBy: "---")
        if components.count >= 3 {
            return components[2...].joined(separator: "---").trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return markdown
    }
    
    private func parseMarkdownTags(_ markdown: String) -> [String] {
        // Simple tag parsing from frontmatter
        if let tagRange = markdown.range(of: "tags: \\[.*\\]", options: .regularExpression) {
            let tagString = String(markdown[tagRange])
            // Extract tags between brackets
            if let bracketStart = tagString.firstIndex(of: "["),
               let bracketEnd = tagString.firstIndex(of: "]") {
                let tagsContent = String(tagString[tagString.index(after: bracketStart)..<bracketEnd])
                return tagsContent.components(separatedBy: ", ").map { $0.trimmingCharacters(in: .whitespaces) }
            }
        }
        return []
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
