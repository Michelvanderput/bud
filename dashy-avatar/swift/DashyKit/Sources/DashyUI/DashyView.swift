#if canImport(SwiftUI)
import SwiftUI
import DashyCore

/// Dashy as a SwiftUI view, drawn with `Canvas`. All motion comes from DashyCore.
///
/// - Reduced motion (`accessibilityReduceMotion`): one still frame, no animation loop.
/// - Pauses while the app is not active and while the view is not on screen.
/// - Screen readers get a text label for the current state (Dutch by default; pass `labels` to change).
/// - `variant: .auto` uses the simpler small drawing at 32 pt and below.
public struct DashyView: View {
    public enum Variant: Sendable { case full, small, auto }

    private let state: DashyState
    private let shape: DashyShape
    private let variant: Variant
    private let labels: [DashyState: String]
    private let seed: UInt32?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var model: Model
    @State private var visible = true

    public init(state: DashyState = .idle, shape: DashyShape = .square, variant: Variant = .auto,
                labels: [DashyState: String] = [:], seed: UInt32? = nil) {
        self.state = state; self.shape = shape; self.variant = variant; self.labels = labels; self.seed = seed
        _model = State(initialValue: Model(seed: seed ?? UInt32.random(in: 1...999_999)))
    }

    public static let defaultLabels: [DashyState: String] = [
        .idle: "Dashy wacht rustig", .received: "Dashy heeft een taak gekregen", .working: "Dashy is aan het werk",
        .thinking: "Dashy denkt na", .waiting: "Dashy wacht op jou", .blocked: "Dashy zit vast en heeft hulp nodig",
        .done: "Dashy is klaar", .happy: "Dashy is blij", .sad: "Dashy is sip", .angry: "Dashy is boos",
        .strict: "Dashy is streng", .dancing: "Dashy danst", .sleepy: "Dashy is slaperig",
    ]

    /// Holds the simulation. A reference type so stepping inside the draw closure does not invalidate the view.
    final class Model {
        let dashy: Dashy
        var applied: DashyState = .idle
        var appliedShape: DashyShape = .square
        init(seed: UInt32) { dashy = Dashy(seed: seed) }
    }

    private var paused: Bool { reduceMotion || scenePhase != .active || !visible }
    private var label: String { (labels[state] ?? Self.defaultLabels[state]) ?? "Dashy" }

    public var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let small = variant == .small || (variant == .auto && side <= dashySmallMaxPoints)
            TimelineView(.animation(minimumInterval: nil, paused: paused)) { timeline in
                Canvas { ctx, size in
                    let now = timeline.date.timeIntervalSinceReferenceDate * 1000
                    sync(now: now)
                    let g: Geometry = reduceMotion ? settle(now: now) : model.dashy.step(now: now)
                    DashyPainter.draw(small ? smallGeometry(g) : g, small: small, in: &ctx, size: size)
                }
            }
            .frame(width: side, height: side)
            .position(x: geo.size.width / 2, y: geo.size.height / 2)
        }
        .aspectRatio(1, contentMode: .fit)
        .contentShape(Rectangle())
        .onTapGesture { if !reduceMotion { model.dashy.poke(now: Date.timeIntervalSinceReferenceDate * 1000) } }
        .onAppear { visible = true }
        .onDisappear { visible = false }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityAddTraits(.isImage)
    }

    /// Apply changed inputs to the simulation (only when they changed, like the React component).
    private func sync(now: Double) {
        if model.appliedShape != shape { model.dashy.setShape(shape); model.appliedShape = shape }
        if model.applied != state { model.applied = state; model.dashy.setState(state, now: now) }
    }

    /// Reduced motion: simulate ~1.5 s instantly and show that one still frame.
    private func settle(now: Double) -> Geometry {
        var g = model.dashy.step(now: now)
        var t = now
        for _ in 0..<90 { t += 16.7; g = model.dashy.step(now: t) }
        return g
    }
}

enum DashyPainter {
    private static let ink = Color(red: 0x10 / 255, green: 0x12 / 255, blue: 0x14 / 255)
    private static let outline = Color(red: 0xc9 / 255, green: 0xc9 / 255, blue: 0xc4 / 255)

    /// Draws the 300 x 300 coordinate system scaled into `size`. Same maths as the SVG (render.ts), see layout there.
    static func draw(_ g: Geometry, small: Bool, in ctx: inout GraphicsContext, size: CGSize) {
        let scale = min(size.width, size.height) / 300
        ctx.translateBy(x: (size.width - 300 * scale) / 2, y: (size.height - 300 * scale) / 2)
        ctx.scaleBy(x: scale, y: scale)

        ctx.drawLayer { body in
            body.translateBy(x: g.body.tx, y: g.body.ty)
            body.rotate(by: .degrees(g.body.rot))
            body.scaleBy(x: g.body.sx, y: g.body.sy)
            body.translateBy(x: -150, y: -260)

            let shape = RoundedRectangle(cornerRadius: g.rx, style: .circular).path(in: CGRect(x: 40, y: 40, width: 220, height: 220))
            body.fill(shape, with: .color(.white))
            body.stroke(shape, with: .color(outline), lineWidth: small ? 8 : 1)

            body.clip(to: shape)
            body.translateBy(x: g.face.tx, y: g.face.ty)
            body.rotate(by: .degrees(g.face.rot))
            body.scaleBy(x: g.face.sx, y: g.face.sy)
            for e in g.eyes { eye(e, in: &body) }
        }
    }

    /// One eye: the pill, minus the upper lid (a rotated rectangle) and minus the lower arc (happy), via a separate layer.
    private static func eye(_ e: EyeGeometry, in ctx: inout GraphicsContext) {
        ctx.drawLayer { layer in
            layer.translateBy(x: e.x, y: e.y)
            layer.rotate(by: .degrees(e.tilt))
            let hw = e.ew / 2, eh = e.eh
            let pill = Path(roundedRect: CGRect(x: -hw, y: -eh / 2, width: e.ew, height: eh), cornerRadius: min(hw, eh / 2))
            layer.fill(pill, with: .color(ink))
            layer.blendMode = .destinationOut
            // upper lid: covers everything above yb, rotated around (0, yb)
            let yb = -eh / 2 + e.cov * eh
            var lid = layer
            lid.translateBy(x: 0, y: yb)
            lid.rotate(by: .degrees(e.lidA))
            lid.fill(Path(CGRect(x: -90, y: -140, width: 180, height: 140)), with: .color(.black))
            // lower lid arc (happy)
            if e.low > 0.001 {
                let ry = eh * 0.62, yt = eh / 2 - e.low * eh
                layer.fill(Path(ellipseIn: CGRect(x: -e.ew * 0.95, y: yt + ry - ry, width: e.ew * 1.9, height: ry * 2)), with: .color(.black))
            }
        }
    }
}
#endif
