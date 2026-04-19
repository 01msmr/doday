//
//  MarkdownService.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import Foundation

/// Service für Markdown-Verarbeitung
/// Erstellt Obsidian-kompatible .md-Dateien mit YAML Frontmatter
class MarkdownService {
    
    // MARK: - Dateiname-Generierung
    
    /// Generiert Dateinamen basierend auf TimeScope und Datum
    /// - Parameters:
    ///   - scope: TimeScope (today, week, monthYear)
    ///   - date: Datum
    ///   - isYear: Bei monthYear: true = Jahr, false = Monat
    /// - Returns: Dateiname ohne Pfad, z.B. "2026-04-19.md"
    static func generateFileName(scope: TimeScope, date: Date, isYear: Bool = false) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        
        switch scope {
        case .today:
            formatter.dateFormat = "yyyy-MM-dd"
            return "\(formatter.string(from: date)).md"
            
        case .tomorrow:
            // Tomorrow uses same date format as today
            formatter.dateFormat = "yyyy-MM-dd"
            return "\(formatter.string(from: date)).md"
            
        case .week:
            let calendar = Calendar.current
            let weekNumber = calendar.component(.weekOfYear, from: date)
            let year = calendar.component(.year, from: date)
            return String(format: "%04d-W%02d.md", year, weekNumber)
            
        case .monthYear:
            if isYear {
                formatter.dateFormat = "yyyy"
                return "\(formatter.string(from: date)).md"
            } else {
                formatter.dateFormat = "yyyy-MM"
                return "\(formatter.string(from: date)).md"
            }
        }
    }
    
    /// Generiert vollständigen Pfad für Nextcloud
    /// - Parameters:
    ///   - fileName: Dateiname (z.B. "2026-04-19.md")
    ///   - date: Datum für Jahr-Ordner
    /// - Returns: Relativer Pfad, z.B. "/Notes/Journal/2026/2026-04-19.md"
    static func generateFilePath(fileName: String, date: Date) -> String {
        let calendar = Calendar.current
        let year = calendar.component(.year, from: date)
        return "/Notes/Journal/\(year)/\(fileName)"
    }
    
    // MARK: - Frontmatter
    
    /// Generiert YAML Frontmatter für Obsidian
    /// - Parameters:
    ///   - date: Datum
    ///   - scope: TimeScope
    ///   - tags: Array von Tags
    /// - Returns: Frontmatter-String
    static func generateFrontmatter(date: Date, scope: TimeScope, tags: [String] = []) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let dateString = formatter.string(from: date)
        
        let tagsString = tags.isEmpty ? "[]" : "[\(tags.joined(separator: ", "))]"
        let scopeString = scope.rawValue.lowercased()
        
        return """
        ---
        date: \(dateString)
        scope: \(scopeString)
        tags: \(tagsString)
        ---
        
        """
    }
    
    // MARK: - Vollständiges Markdown
    
    /// Erstellt vollständiges Markdown-Dokument
    /// - Parameters:
    ///   - content: Inhalt (ohne Frontmatter)
    ///   - date: Datum
    ///   - scope: TimeScope
    ///   - tags: Array von Tags
    /// - Returns: Vollständiges Markdown mit Frontmatter
    static func createMarkdownDocument(content: String, date: Date, scope: TimeScope, tags: [String] = []) -> String {
        let frontmatter = generateFrontmatter(date: date, scope: scope, tags: tags)
        let header = generateHeader(date: date, scope: scope)
        
        return frontmatter + header + "\n\n" + content
    }
    
    /// Generiert Überschrift basierend auf Datum und Scope
    private static func generateHeader(date: Date, scope: TimeScope) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        
        switch scope {
        case .today:
            formatter.dateFormat = "EEEE, d. MMMM yyyy"
            return "# \(formatter.string(from: date))"
            
        case .tomorrow:
            formatter.dateFormat = "EEEE, d. MMMM yyyy"
            return "# \(formatter.string(from: date))"
            
        case .week:
            let calendar = Calendar.current
            let weekNumber = calendar.component(.weekOfYear, from: date)
            return "# Woche \(weekNumber), \(calendar.component(.year, from: date))"
            
        case .monthYear:
            formatter.dateFormat = "MMMM yyyy"
            return "# \(formatter.string(from: date))"
        }
    }
    
    // MARK: - Parsing
    
    /// Extrahiert Frontmatter aus Markdown
    /// - Parameter markdown: Vollständiges Markdown-Dokument
    /// - Returns: Tuple (frontmatter, content) oder nil
    static func parseFrontmatter(from markdown: String) -> (frontmatter: [String: String], content: String)? {
        // Prüfe, ob Dokument mit "---" beginnt
        guard markdown.hasPrefix("---") else {
            return nil
        }
        
        // Suche Ende des Frontmatters
        let lines = markdown.components(separatedBy: "\n")
        var frontmatterLines: [String] = []
        var contentStartIndex = 0
        var inFrontmatter = false
        
        for (index, line) in lines.enumerated() {
            if index == 0 && line == "---" {
                inFrontmatter = true
                continue
            }
            
            if inFrontmatter && line == "---" {
                contentStartIndex = index + 1
                break
            }
            
            if inFrontmatter {
                frontmatterLines.append(line)
            }
        }
        
        // Parse Frontmatter (einfaches Key-Value)
        var frontmatter: [String: String] = [:]
        for line in frontmatterLines {
            let parts = line.components(separatedBy: ": ")
            if parts.count == 2 {
                frontmatter[parts[0].trimmingCharacters(in: .whitespaces)] = parts[1].trimmingCharacters(in: .whitespaces)
            }
        }
        
        // Extrahiere Content
        let contentLines = Array(lines[contentStartIndex...])
        let content = contentLines.joined(separator: "\n")
        
        return (frontmatter, content)
    }
}
