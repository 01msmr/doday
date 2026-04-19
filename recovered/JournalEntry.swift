//
//  JournalEntry.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import Foundation

/// Model für einen Journal-Eintrag
/// Wird als Markdown-Datei in Nextcloud gespeichert (später implementiert)
/// Format: YYYY-MM-DD.md, YYYY-Www.md, YYYY-MM.md, YYYY.md
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
    
    /// Dateiname für Nextcloud/Obsidian
    /// Beispiel: 2026-04-19.md, 2026-W16.md, 2026-04.md, 2026.md
    var fileName: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        
        switch scope {
        case .today:
            formatter.dateFormat = "yyyy-MM-dd"
            return "\(formatter.string(from: date)).md"
            
        case .week:
            let calendar = Calendar.current
            let weekNumber = calendar.component(.weekOfYear, from: date)
            let year = calendar.component(.year, from: date)
            return String(format: "%04d-W%02d.md", year, weekNumber)
            
        case .monthYear:
            // Hier später unterscheiden zwischen Monat und Jahr
            // Vorerst: Monatsformat
            formatter.dateFormat = "yyyy-MM"
            return "\(formatter.string(from: date)).md"
        }
    }
    
    /// YAML Frontmatter für Obsidian-Kompatibilität
    var frontmatter: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let dateString = formatter.string(from: date)
        
        let tagsString = tags.isEmpty ? "[]" : "[\(tags.joined(separator: ", "))]"
        
        return """
        ---
        date: \(dateString)
        scope: \(scope.rawValue.lowercased())
        tags: \(tagsString)
        ---
        
        """
    }
    
    /// Vollständiger Markdown-Inhalt mit Frontmatter
    var fullMarkdown: String {
        return frontmatter + content
    }
}
