import Foundation

/// Port of src/small.ts: simpler drawing for 24 to 32 px. Pure; adds no animation of its own.
public let dashySmallMaxPoints: Double = 32

public func smallGeometry(_ G: Geometry) -> Geometry {
    func clamp(_ v: Double, _ a: Double, _ b: Double) -> Double { max(a, min(b, v)) }
    var out = G
    out.body = DashyTransform(tx: 150, ty: 260, rot: 0, sx: 1, sy: 1)
    out.face = DashyTransform(tx: G.face.tx, ty: G.face.ty, rot: 0, sx: 1.01, sy: 1.01)
    out.eyes = G.eyes.map { e in
        var s = e
        s.tilt = 0
        s.ew = e.ew * 1.35
        s.cov = e.cov > 0.1 ? clamp(0.25 + e.cov * 0.9, 0, 0.9) : 0
        s.lidA = clamp(e.lidA * 1.6, -40, 40)
        s.low = e.low > 0.001 ? max(e.low, 0.4) : 0
        return s
    }
    return out
}
