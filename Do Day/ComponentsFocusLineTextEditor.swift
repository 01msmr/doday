//
//  FocusLineTextEditor.swift
//  Do Day
//
//  Created by Uli on 19.04.26.
//

import SwiftUI

#if canImport(UIKit)
import UIKit

/// Custom Text Editor mit fokus-abhängiger Schriftgröße
/// - Aktive Zeile (Cursor): 17pt (touch-kompatibel)
/// - Alle anderen Zeilen: ~11pt (66% von 17pt)
/// - Implementierung via UIViewRepresentable mit UITextView
/// - Schriftgröße wechselt in Echtzeit bei Cursor-Bewegung
struct FocusLineTextEditor: UIViewRepresentable {
    @Binding var text: String
    
    // Schriftgrößen-Konfiguration
    let activeFontSize: CGFloat = 17.0   // Normale Größe für aktive Zeile
    let inactiveFontSize: CGFloat = 11.0  // 66% für inaktive Zeilen (~11pt)
    
    func makeUIView(context: Context) -> UITextView {
        let textView = UITextView()
        textView.delegate = context.coordinator
        textView.font = UIFont.systemFont(ofSize: activeFontSize)
        textView.backgroundColor = .clear
        textView.textContainerInset = UIEdgeInsets(top: 12, left: 12, bottom: 12, right: 12)
        
        // Rahmen im Display-Stil (später verfeinern)
        textView.layer.borderColor = UIColor.systemGray3.cgColor
        textView.layer.borderWidth = 1.5
        textView.layer.cornerRadius = 8
        
        // Add keyboard toolbar with "Done" button
        let toolbar = UIToolbar()
        toolbar.sizeToFit()
        
        let flexSpace = UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
        let doneButton = UIBarButtonItem(
            title: "Fertig",
            style: .done,
            target: context.coordinator,
            action: #selector(Coordinator.dismissKeyboard)
        )
        
        toolbar.items = [flexSpace, doneButton]
        textView.inputAccessoryView = toolbar
        
        return textView
    }
    
    func updateUIView(_ uiView: UITextView, context: Context) {
        if uiView.text != text {
            uiView.text = text
        }
        
        // Schriftgröße basierend auf Cursor-Position aktualisieren
        updateFontSizes(in: uiView)
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    /// Aktualisiert die Schriftgrößen aller Zeilen basierend auf Cursor-Position
    private func updateFontSizes(in textView: UITextView) {
        guard !textView.text.isEmpty else { return }
        
        let attributedString = NSMutableAttributedString(string: textView.text)
        let fullRange = NSRange(location: 0, length: attributedString.length)
        
        // Bestimme die aktuelle Zeile (wo der Cursor ist)
        let cursorPosition = textView.selectedRange.location
        let currentLineRange = (textView.text as NSString).lineRange(for: NSRange(location: cursorPosition, length: 0))
        
        // Setze alle Zeilen auf inaktive Größe
        attributedString.addAttribute(.font, value: UIFont.systemFont(ofSize: inactiveFontSize), range: fullRange)
        
        // Setze aktive Zeile auf aktive Größe
        attributedString.addAttribute(.font, value: UIFont.systemFont(ofSize: activeFontSize), range: currentLineRange)
        
        // Speichere Cursor-Position vor Update
        let selectedRange = textView.selectedRange
        
        // Aktualisiere Text mit neuen Attributen
        textView.attributedText = attributedString
        
        // Stelle Cursor-Position wieder her
        textView.selectedRange = selectedRange
    }
    
    // MARK: - Coordinator
    
    class Coordinator: NSObject, UITextViewDelegate {
        var parent: FocusLineTextEditor
        weak var textView: UITextView?
        
        init(_ parent: FocusLineTextEditor) {
            self.parent = parent
        }
        
        func textViewDidChange(_ textView: UITextView) {
            self.textView = textView
            parent.text = textView.text
            parent.updateFontSizes(in: textView)
        }
        
        func textViewDidChangeSelection(_ textView: UITextView) {
            self.textView = textView
            // Bei Cursor-Bewegung Schriftgrößen aktualisieren
            parent.updateFontSizes(in: textView)
        }
        
        @objc func dismissKeyboard() {
            textView?.resignFirstResponder()
        }
    }
}

// MARK: - Preview

#Preview {
    @Previewable @State var sampleText = """
    Erste Zeile (klein, wenn Cursor woanders)
    Zweite Zeile (groß, wenn Cursor hier)
    Dritte Zeile (klein, wenn Cursor woanders)
    Vierte Zeile (klein)
    """
    
    VStack {
        Text("FocusLineTextEditor Demo")
            .font(.headline)
            .padding()
        
        FocusLineTextEditor(text: $sampleText)
            .frame(height: 200)
            .padding()
        
        Text("Aktive Zeile: 17pt | Andere: 11pt")
            .font(.caption)
            .foregroundColor(.secondary)
    }
}
#else
// MARK: - macOS Fallback (für spätere macOS-Unterstützung)

/// Fallback für macOS (AppKit-basiert)
/// Aktuell: Einfacher TextEditor ohne Fokus-Feature
struct FocusLineTextEditor: View {
    @Binding var text: String
    
    var body: some View {
        TextEditor(text: $text)
            .font(.system(size: 17))
            .padding(12)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.gray.opacity(0.3), lineWidth: 1.5)
            )
    }
}

#Preview("macOS Fallback") {
    @Previewable @State var sampleText = "macOS TextEditor (ohne Fokus-Feature)"
    
    VStack {
        Text("macOS Fallback")
            .font(.headline)
            .padding()
        
        FocusLineTextEditor(text: $sampleText)
            .frame(height: 200)
            .padding()
    }
}

#endif

