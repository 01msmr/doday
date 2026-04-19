//
//  NextcloudConfig.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import Foundation
import Combine
import Security

/// Konfiguration für Nextcloud-Verbindung
/// Credentials werden sicher im Keychain gespeichert
class NextcloudConfig: ObservableObject {
    @Published var serverURL: String = "https://cd.msmr.co"
    @Published var username: String = ""
    @Published var isConfigured: Bool = false
    
    // Keychain-Konstanten
    private let service = "de.doday.app"
    private let usernameKey = "nextcloud_username"
    private let passwordKey = "nextcloud_password"
    
    init() {
        loadFromKeychain()
    }
    
    // MARK: - Keychain-Operationen
    
    /// Lädt Credentials aus Keychain
    func loadFromKeychain() {
        // Username aus UserDefaults (nicht sensitiv)
        if let savedUsername = UserDefaults.standard.string(forKey: usernameKey) {
            username = savedUsername
        }
        
        // Password aus Keychain
        if let _ = getPasswordFromKeychain() {
            isConfigured = true
        }
    }
    
    /// Speichert Credentials in Keychain
    /// - Parameters:
    ///   - username: Nextcloud-Benutzername
    ///   - password: Nextcloud-Passwort oder App-Passwort
    /// - Returns: true bei Erfolg
    func saveCredentials(username: String, password: String) -> Bool {
        // Username in UserDefaults
        UserDefaults.standard.set(username, forKey: usernameKey)
        self.username = username
        
        // Password in Keychain
        let success = savePasswordToKeychain(password: password)
        if success {
            isConfigured = true
        }
        return success
    }
    
    /// Löscht Credentials aus Keychain
    func deleteCredentials() {
        UserDefaults.standard.removeObject(forKey: usernameKey)
        deletePasswordFromKeychain()
        username = ""
        isConfigured = false
    }
    
    /// Gibt gespeichertes Passwort zurück (für WebDAV-Service)
    func getPassword() -> String? {
        return getPasswordFromKeychain()
    }
    
    // MARK: - Private Keychain-Helfer
    
    /// Speichert Passwort im Keychain
    private func savePasswordToKeychain(password: String) -> Bool {
        guard let passwordData = password.data(using: .utf8) else {
            return false
        }
        
        // Lösche altes Passwort falls vorhanden
        deletePasswordFromKeychain()
        
        // Erstelle neuen Keychain-Eintrag
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: passwordKey,
            kSecValueData as String: passwordData
        ]
        
        let status = SecItemAdd(query as CFDictionary, nil)
        return status == errSecSuccess
    }
    
    /// Liest Passwort aus Keychain
    private func getPasswordFromKeychain() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: passwordKey,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        guard status == errSecSuccess,
              let passwordData = result as? Data,
              let password = String(data: passwordData, encoding: .utf8) else {
            return nil
        }
        
        return password
    }
    
    /// Löscht Passwort aus Keychain
    private func deletePasswordFromKeychain() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: passwordKey
        ]
        
        SecItemDelete(query as CFDictionary)
    }
    
    // MARK: - WebDAV-URLs
    
    /// Gibt vollständige WebDAV-URL zurück
    var webdavURL: String {
        return "\(serverURL)/remote.php/dav/files/\(username)"
    }
    
    /// Generiert vollständige URL für eine Datei
    /// - Parameter filePath: Relativer Pfad, z.B. "/Notes/Journal/2026/2026-04-19.md"
    /// - Returns: Vollständige URL
    func fileURL(for filePath: String) -> String {
        return webdavURL + filePath
    }
}

// MARK: - Verwendung
// 1. Beim ersten Start: Benutzer gibt Username + Password/App-Password ein
// 2. App speichert in Keychain via saveCredentials()
// 3. WebDAVService lädt Credentials via getPassword()
// 4. Bei Logout: deleteCredentials()
