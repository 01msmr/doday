//
//  TimeScope.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import Foundation

/// Enum für die drei Zeitraum-Modi der App
/// - today: Heutige Ansicht (DO DAY - linke Seite des kombinierten Buttons)
/// - tomorrow: Morgen-Ansicht (DO MORROW - rechte Seite des kombinierten Buttons)
/// - week: Wochenansicht (25% Breite, mit Swipe-Navigation)
/// - monthYear: Monats-/Jahresansicht (25% Breite, mit Toggle)
enum TimeScope: String, Codable, CaseIterable {
    case today = "Heute"
    case tomorrow = "Morgen"
    case week = "Woche"
    case monthYear = "Monat/Jahr"
    
    /// Benutzerfreundliche Bezeichnung für UI
    var displayName: String {
        return self.rawValue
    }
    
    /// Kurzbezeichnung für platzsparende Darstellung
    var shortName: String {
        switch self {
        case .today:
            return "Tag"
        case .tomorrow:
            return "Morgen"
        case .week:
            return "Woche"
        case .monthYear:
            return "M/J"
        }
    }
}
