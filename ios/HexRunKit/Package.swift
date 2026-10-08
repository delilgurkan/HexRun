// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "HexRunKit",
    platforms: [.iOS(.v17), .watchOS(.v10), .macOS(.v14)],
    products: [.library(name: "HexRunKit", targets: ["HexRunKit"])],
    targets: [
        .target(
            name: "CH3",
            path: "Sources/CH3",
            cSettings: [.headerSearchPath(".")],
            linkerSettings: [.linkedLibrary("m", .when(platforms: [.linux]))]
        ),
        .target(name: "HexRunKit", dependencies: ["CH3"]),
        .testTarget(name: "HexRunKitTests", dependencies: ["HexRunKit"]),
    ]
)
