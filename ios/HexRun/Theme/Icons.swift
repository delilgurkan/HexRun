import SwiftUI
import UIKit
import HexRunKit

/// Tokens · İkonlar: 24 pt ızgara, 2 pt çizgi, yuvarlak uç ve birleşim.
enum IconName: String, CaseIterable {
    case map, league, team, events, bell, streak, locate, layers, start, loop, pause, stop, siege, defend, heading, area, time, pace
    case share, back, close, lock, play, check, plus, chevron, gear, clap, watch, ghost, swap, eye
}

extension Path {
    init(ops: [PathOp], scale: CGFloat) {
        self.init()
        for op in ops {
            switch op {
            case let .move(x, y): move(to: CGPoint(x: x * scale, y: y * scale))
            case let .line(x, y): addLine(to: CGPoint(x: x * scale, y: y * scale))
            case let .cubic(x1, y1, x2, y2, x, y):
                addCurve(to: CGPoint(x: x * scale, y: y * scale), control1: CGPoint(x: x1 * scale, y: y1 * scale), control2: CGPoint(x: x2 * scale, y: y2 * scale))
            case let .quad(x1, y1, x, y):
                addQuadCurve(to: CGPoint(x: x * scale, y: y * scale), control: CGPoint(x: x1 * scale, y: y1 * scale))
            case .close: closeSubpath()
            }
        }
    }
}

enum IconCache {
    private static var ops: [IconName: [PathOp]] = [:]
    static func ops(_ n: IconName) -> [PathOp] {
        if let o = ops[n] { return o }
        let o = SVGPath.parse(IconPaths.all[n.rawValue] ?? "")
        ops[n] = o
        return o
    }

    /// Sekme çubuğu ve UIKit için şablon görüntü.
    static func image(_ n: IconName, size: CGFloat = 24, lineWidth: CGFloat = 2) -> UIImage {
        let s = size / 24
        let path = Path(ops: ops(n), scale: s)
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size))
        let img = renderer.image { ctx in
            let cg = ctx.cgContext
            cg.addPath(path.cgPath)
            cg.setLineWidth(lineWidth * s)
            cg.setLineCap(.round)
            cg.setLineJoin(.round)
            cg.setStrokeColor(UIColor.black.cgColor)
            cg.strokePath()
        }
        return img.withRenderingMode(.alwaysTemplate)
    }
}

/// Çizgi ikon. Erişilebilirlikte gizlidir; etiket düğmede verilir.
struct Icon: View {
    let name: IconName
    var size: CGFloat = 24
    var color: Color?
    var lineWidth: CGFloat = 2
    var fill: Color?
    @Environment(\.theme) private var t

    init(_ name: IconName, size: CGFloat = 24, color: Color? = nil, lineWidth: CGFloat = 2, fill: Color? = nil) {
        self.name = name
        self.size = size
        self.color = color
        self.lineWidth = lineWidth
        self.fill = fill
    }

    var body: some View {
        let path = Path(ops: IconCache.ops(name), scale: size / 24)
        ZStack {
            if let fill { path.fill(fill) }
            path.stroke(color ?? t.c.ink, style: StrokeStyle(lineWidth: lineWidth * size / 24, lineCap: .round, lineJoin: .round))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
