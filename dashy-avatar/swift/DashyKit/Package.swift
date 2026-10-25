// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "DashyKit",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        // Pure simulation: Foundation only, builds everywhere (also Linux).
        .library(name: "DashyCore", targets: ["DashyCore"]),
        // SwiftUI Canvas view on top of DashyCore (Apple platforms only).
        .library(name: "DashyUI", targets: ["DashyUI"]),
    ],
    targets: [
        .target(name: "DashyCore"),
        .target(name: "DashyUI", dependencies: ["DashyCore"]),
        .testTarget(name: "DashyKitTests", dependencies: ["DashyCore"], resources: [.copy("Resources/reference.json")]),
    ]
)
