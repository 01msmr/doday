//
//  WebDAVService.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import Foundation
import Combine

/// Service für WebDAV-Kommunikation mit Nextcloud
/// Download/Upload von .md-Dateien und habits.json
/// Sync-Strategie: App-Start → Download, App-Verlassen → Upload, Konflikt → Server gewinnt
class WebDAVService: ObservableObject {
    @Published var isConnected: Bool = false
    @Published var lastSyncDate: Date?
    
    // WebDAV-Konfiguration (später aus NextcloudConfig laden)
    private var baseURL: String = "https://cd.msmr.co/remote.php/dav/files/"
    private var username: String = ""
    private var password: String = ""
    
    // MARK: - Initialisierung
    
    init(username: String = "", password: String = "") {
        self.username = username
        self.password = password
    }
    
    /// Setzt Credentials (später aus Keychain laden)
    func setCredentials(username: String, password: String) {
        self.username = username
        self.password = password
    }
    
    // MARK: - Download
    
    /// Lädt eine Datei von Nextcloud herunter
    /// - Parameter filePath: Relativer Pfad, z.B. "/Notes/Journal/2026/2026-04-19.md"
    /// - Returns: Dateiinhalt als String oder nil
    func downloadFile(filePath: String) async -> String? {
        guard !username.isEmpty, !password.isEmpty else {
            print("Keine Credentials gesetzt")
            return nil
        }
        
        let urlString = baseURL + username + filePath
        guard let url = URL(string: urlString) else {
            print("Ungültige URL: \(urlString)")
            return nil
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        
        // Basic Auth
        if let authData = "\(username):\(password)".data(using: .utf8) {
            let base64Auth = authData.base64EncodedString()
            request.setValue("Basic \(base64Auth)", forHTTPHeaderField: "Authorization")
        }
        
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                print("Keine HTTP-Response")
                return nil
            }
            
            if httpResponse.statusCode == 200 {
                lastSyncDate = Date()
                return String(data: data, encoding: .utf8)
            } else if httpResponse.statusCode == 404 {
                print("Datei nicht gefunden: \(filePath)")
                return nil
            } else {
                print("Download-Fehler: HTTP \(httpResponse.statusCode)")
                return nil
            }
        } catch {
            print("Download-Fehler: \(error)")
            return nil
        }
    }
    
    // MARK: - Upload
    
    /// Lädt eine Datei zu Nextcloud hoch (überschreibt existierende)
    /// - Parameters:
    ///   - content: Dateiinhalt als String
    ///   - filePath: Relativer Pfad, z.B. "/Notes/Journal/2026/2026-04-19.md"
    /// - Returns: true bei Erfolg
    func uploadFile(content: String, filePath: String) async -> Bool {
        guard !username.isEmpty, !password.isEmpty else {
            print("Keine Credentials gesetzt")
            return false
        }
        
        let urlString = baseURL + username + filePath
        guard let url = URL(string: urlString) else {
            print("Ungültige URL: \(urlString)")
            return false
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.httpBody = content.data(using: .utf8)
        
        // Basic Auth
        if let authData = "\(username):\(password)".data(using: .utf8) {
            let base64Auth = authData.base64EncodedString()
            request.setValue("Basic \(base64Auth)", forHTTPHeaderField: "Authorization")
        }
        
        // Content-Type für Markdown
        request.setValue("text/markdown; charset=utf-8", forHTTPHeaderField: "Content-Type")
        
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                print("Keine HTTP-Response")
                return false
            }
            
            if httpResponse.statusCode == 201 || httpResponse.statusCode == 204 {
                // 201 = Created, 204 = Updated
                lastSyncDate = Date()
                isConnected = true
                return true
            } else {
                print("Upload-Fehler: HTTP \(httpResponse.statusCode)")
                return false
            }
        } catch {
            print("Upload-Fehler: \(error)")
            return false
        }
    }
    
    // MARK: - Verzeichnis erstellen
    
    /// Erstellt ein Verzeichnis auf Nextcloud (z.B. Jahr-Ordner)
    /// - Parameter directoryPath: Relativer Pfad, z.B. "/Notes/Journal/2026"
    /// - Returns: true bei Erfolg
    func createDirectory(directoryPath: String) async -> Bool {
        guard !username.isEmpty, !password.isEmpty else {
            print("Keine Credentials gesetzt")
            return false
        }
        
        let urlString = baseURL + username + directoryPath
        guard let url = URL(string: urlString) else {
            print("Ungültige URL: \(urlString)")
            return false
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "MKCOL" // WebDAV-Methode für Verzeichnis erstellen
        
        // Basic Auth
        if let authData = "\(username):\(password)".data(using: .utf8) {
            let base64Auth = authData.base64EncodedString()
            request.setValue("Basic \(base64Auth)", forHTTPHeaderField: "Authorization")
        }
        
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                print("Keine HTTP-Response")
                return false
            }
            
            if httpResponse.statusCode == 201 || httpResponse.statusCode == 405 {
                // 201 = Created, 405 = Already exists (auch OK)
                return true
            } else {
                print("Verzeichnis-Erstellungs-Fehler: HTTP \(httpResponse.statusCode)")
                return false
            }
        } catch {
            print("Verzeichnis-Erstellungs-Fehler: \(error)")
            return false
        }
    }
    
    // MARK: - Verbindungstest
    
    /// Testet Verbindung zu Nextcloud
    /// - Returns: true bei erfolgreicher Verbindung
    func testConnection() async -> Bool {
        guard !username.isEmpty, !password.isEmpty else {
            print("Keine Credentials gesetzt")
            return false
        }
        
        let testPath = "/Notes/Journal"
        let urlString = baseURL + username + testPath
        guard let url = URL(string: urlString) else {
            print("Ungültige URL: \(urlString)")
            return false
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "PROPFIND" // WebDAV-Methode zum Auflisten
        request.setValue("0", forHTTPHeaderField: "Depth")
        
        // Basic Auth
        if let authData = "\(username):\(password)".data(using: .utf8) {
            let base64Auth = authData.base64EncodedString()
            request.setValue("Basic \(base64Auth)", forHTTPHeaderField: "Authorization")
        }
        
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                return false
            }
            
            isConnected = (httpResponse.statusCode == 207) // 207 = Multi-Status (WebDAV)
            return isConnected
        } catch {
            print("Verbindungstest-Fehler: \(error)")
            isConnected = false
            return false
        }
    }
}

// MARK: - Später: Integration mit NextcloudConfig
// - Credentials aus Keychain laden
// - Automatischer Sync bei App-Start und -Verlassen
// - Konfliktlösung: Server gewinnt (einfach halten)
