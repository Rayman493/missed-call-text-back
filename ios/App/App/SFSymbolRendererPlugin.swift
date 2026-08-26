/**
 * SFSymbolRendererPlugin
 *
 * Minimal Capacitor plugin for rendering genuine Apple SF Symbols.
 *
 * Purpose: Provide access to UIImage(systemName:) API for rendering
 * authentic SF Symbols in the WebView UI, ensuring Apple HIG compliance.
 *
 * Implementation: Uses UIImage(systemName:) to generate the symbol,
 * converts to base64 PNG, and returns to JS for display in <img> tags.
 */

import Foundation
import Capacitor
import UIKit

@objc(SFSymbolRendererPlugin)
public class SFSymbolRendererPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SFSymbolRendererPlugin"
    public let jsName = "SFSymbolRendererPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "renderSymbol", returnType: CAPPluginReturnPromise)
    ]

    #if DEBUG
    public override init() {
        super.init()
        print("[SF SYMBOL] plugin_loaded=true")
    }
    #endif

    @objc public func renderSymbol(_ call: CAPPluginCall) {
        // Get parameters
        guard let symbolName = call.getString("symbolName") else {
            call.reject("Missing required parameter: symbolName")
            return
        }

        let size = call.getDouble("size") ?? 24.0
        let weight = call.getString("weight") ?? "regular"
        let scale = call.getString("scale") ?? "default"
        let tintColor = call.getString("tintColor") ?? nil

        // Validate symbol name (basic check)
        if symbolName.isEmpty {
            call.reject("symbolName cannot be empty")
            return
        }

        #if DEBUG
        print("[SF SYMBOL] render_requested symbolName=\(symbolName) size=\(size) weight=\(weight) scale=\(scale)")
        #endif

        // Perform on main thread for UIKit operations
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("Plugin instance deallocated")
                return
            }

            // Configure symbol configuration
            let config = UIImage.SymbolConfiguration(pointSize: CGFloat(size), weight: self.parseWeight(weight), scale: self.parseScale(scale))

            // Render the SF Symbol using UIImage(systemName:)
            guard let image = UIImage(systemName: symbolName, withConfiguration: config) else {
                #if DEBUG
                print("[SF SYMBOL] render_failed symbolName=\(symbolName) reason=symbol_not_found")
                #endif
                call.reject("SF Symbol not found: \(symbolName)")
                return
            }

            // Apply tint color if provided
            let finalImage: UIImage
            if let tintColorHex = tintColor {
                finalImage = image.withTintColor(self.colorFromHex(tintColorHex), renderingMode: .alwaysOriginal)
            } else {
                finalImage = image.withRenderingMode(.alwaysTemplate)
            }

            // Convert to PNG data
            guard let pngData = finalImage.pngData() else {
                #if DEBUG
                print("[SF SYMBOL] render_failed symbolName=\(symbolName) reason=png_conversion_failed")
                #endif
                call.reject("Failed to convert image to PNG")
                return
            }

            // Convert to base64
            let base64String = pngData.base64EncodedString()

            #if DEBUG
            print("[SF SYMBOL] render_success symbolName=\(symbolName) base64Length=\(base64String.count)")
            #endif

            call.resolve([
                "base64": base64String,
                "symbolName": symbolName,
                "size": size,
                "weight": weight,
                "scale": scale
            ])
        }
    }

    // Parse weight string to UIImage.SymbolWeight
    private func parseWeight(_ weight: String) -> UIImage.SymbolWeight {
        switch weight.lowercased() {
        case "ultralight": return .ultraLight
        case "thin": return .thin
        case "light": return .light
        case "regular": return .regular
        case "medium": return .medium
        case "semibold": return .semibold
        case "bold": return .bold
        case "heavy": return .heavy
        case "black": return .black
        default: return .regular
        }
    }

    // Parse scale string to UIImage.SymbolScale
    private func parseScale(_ scale: String) -> UIImage.SymbolScale {
        switch scale.lowercased() {
        case "small": return .small
        case "medium": return .medium
        case "large": return .large
        case "default": return .default
        default: return .default
        }
    }

    // Convert hex color string to UIColor
    private func colorFromHex(_ hex: String) -> UIColor {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")

        var rgb: UInt64 = 0
        Scanner(string: hexSanitized).scanHexInt64(&rgb)

        let length = hexSanitized.count
        let r = CGFloat((rgb >> (length * 2)) & 0xFF) / 255.0
        let g = CGFloat((rgb >> length) & 0xFF) / 255.0
        let b = CGFloat(rgb & 0xFF) / 255.0

        return UIColor(red: r, green: g, blue: b, alpha: 1.0)
    }
}