// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ReplyflowStripeTerminal",
    platforms: [
        .iOS(.v15)
    ],
    products: [
        .library(
            name: "ReplyflowStripeTerminal",
            targets: ["ReplyflowStripeTerminal"]
        )
    ],
    dependencies: [
        // Capacitor core via SwiftPM
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", .upToNextMajor(from: "8.4.2")),
        // Stripe Terminal iOS SDK
        .package(url: "https://github.com/stripe/stripe-terminal-ios.git", .upToNextMajor(from: "5.0.0"))
    ],
    targets: [
        .target(
            name: "ReplyflowStripeTerminal",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "StripeTerminal", package: "stripe-terminal-ios")
            ],
            path: "Sources/ReplyflowStripeTerminal"
        )
    ]
)
