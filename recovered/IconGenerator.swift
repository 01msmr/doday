//
//  IconGenerator.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//
//  This file generates the app icon design based on the "Ordner auswählen" button
//  Use this to create screenshots for app icons at various sizes

import SwiftUI

/// App Icon Generator - Based on the "Ordner auswählen" button design
/// This creates a complete button (not half) without dividers or highlights
struct AppIconGenerator: View {
    var body: some View {
        // Full button design as one complete icon
        ZStack {
            // Button background - solid blue
            Color.blue
            
            // Button content - centered
            HStack(spacing: 8) {
                Image(systemName: "folder")
                    .font(.system(size: 40, weight: .semibold))
                Text("DO")
                    .font(.system(size: 40, weight: .bold))
            }
            .foregroundColor(.white)
        }
        .aspectRatio(1.0, contentMode: .fit) // Square for app icon
    }
}

/// Simple folder icon variant - minimalist
struct AppIconGeneratorSimple: View {
    var body: some View {
        ZStack {
            Color.blue
            
            Image(systemName: "folder")
                .font(.system(size: 140, weight: .semibold))
                .foregroundColor(.white)
        }
        .aspectRatio(1.0, contentMode: .fit)
    }
}

/// Folder with badge variant
struct AppIconGeneratorBadge: View {
    var body: some View {
        ZStack {
            Color.blue
            
            Image(systemName: "folder.badge.plus")
                .font(.system(size: 140, weight: .semibold))
                .foregroundColor(.white)
        }
        .aspectRatio(1.0, contentMode: .fit)
    }
}

// MARK: - Preview & Export Helper

#Preview("App Icon - Full Button") {
    AppIconGenerator()
        .frame(width: 1024, height: 1024)
}

#Preview("App Icon - Simple Folder") {
    AppIconGeneratorSimple()
        .frame(width: 1024, height: 1024)
}

#Preview("App Icon - Folder with Badge") {
    AppIconGeneratorBadge()
        .frame(width: 1024, height: 1024)
}

// MARK: - Usage Instructions
/*
 
 So erstellen Sie die App-Icons:
 
 1. Öffnen Sie diese Datei in Xcode
 2. Wählen Sie eine der Preview-Varianten oben
 3. Klicken Sie in der Canvas auf die Preview
 4. Machen Sie einen Screenshot (Cmd+Shift+4) und wählen Sie nur das Icon aus
 5. Oder: Exportieren Sie den View als Bild
 
 ALTERNATIV - Professioneller Weg:
 
 1. Erstellen Sie einen neuen SwiftUI View im Projekt
 2. Setzen Sie den View auf genau 1024x1024
 3. Verwenden Sie Xcode's "Export as Image" Funktion
 
 Benötigte Größen:
 - iOS: 1024x1024 (App Store), 180x180, 120x120, 167x167, 152x152, 76x76
 - watchOS: 1024x1024, 196x196, 216x216, 258x258
 - macOS: 1024x1024, 512x512, 256x256, 128x128, 64x64, 32x32, 16x16
 
 Tool-Empfehlung:
 Laden Sie das 1024x1024 Icon auf https://appicon.co hoch,
 um automatisch alle Größen zu generieren.
 
 */
