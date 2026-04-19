//
//  JournalEntry.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import Foundation

/// Model für einen Journal-Eintrag
/// Wird als Markdown-Datei gespeichert (Obsidian-kompatibel)
/// Format: YYYY-MM-DD.md (Daily), YYYY-Www.md (Weekly)
struct JournalEntry: Identifiable, Codable {
    let id: UUID
    let scope: TimeScope
    let date: Date
    var content: String
    var tags: [String]
    
    /// Initialisierung mit aktuellem Datum
    init(scope: TimeScope, content: String = "", tags: [String] = []) {
        self.id = UUID()
        self.scope = scope
        self.date = Date()
        self.content = content
        self.tags = tags
    }
    
    /// Unterordner basierend auf Scope
    var folderPath: String {
        switch scope {
        case .today, .tomorrow:
            return "Daily"
        case .week:
            return "Weekly"
        case .monthYear:
            return "Daily" // Month/Year views also use daily files
        }
    }
    
    /// Dateiname für Obsidian
    /// Beispiel: 2026-04-19.md, 2026-W16.md
    var fileName: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        
        switch scope {
        case .today, .tomorrow, .monthYear:
            formatter.dateFormat = "yyyy-MM-dd"
            return "\(formatter.string(from: date)).md"
            
        case .week:
            let calendar = Calendar.current
            let weekNumber = calendar.component(.weekOfYear, from: date)
            let year = calendar.component(.year, from: date)
            return String(format: "%04d-W%02d.md", year, weekNumber)
        }
    }
    
    /// Vollständiger Pfad relativ zum Vault-Root
    var fullPath: String {
        return "\(folderPath)/\(fileName)"
    }
    
    /// YAML Frontmatter für Obsidian-Kompatibilität
    var frontmatter: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let dateString = formatter.string(from: date)
        
        let tagsString = tags.isEmpty ? "[]" : "[\(tags.joined(separator: ", "))]"
        
        var frontmatterDict = """
        ---
        date: \(dateString)
        tags: \(tagsString)
        """
        
        // Add week number for weekly entries
        if scope == .week {
            let calendar = Calendar.current
            let weekNumber = calendar.component(.weekOfYear, from: date)
            frontmatterDict += "\nweek: \(weekNumber)"
        }
        
        frontmatterDict += "\n---\n\n"
        
        return frontmatterDict
    }
    
    /// Vollständiger Markdown-Inhalt mit Frontmatter
    var fullMarkdown: String {
        return frontmatter + content
    }
}
