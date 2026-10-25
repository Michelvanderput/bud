import Foundation

/// Port of src/core.ts: pure simulation, no UI, no timers. Feed it time (ms) via `step(now:)` and get geometry back.
/// Coordinate system: 300 x 300 viewBox, body 220 x 220 (40...260), pivot at bottom centre (150, 260).
/// The order of every random-number call is kept identical to the TypeScript, so a seed gives the same animation.

public enum DashyState: String, CaseIterable, Codable, Sendable {
    case idle, received, working, thinking, waiting, blocked, done
    case happy, sad, angry, strict, dancing, sleepy

    /// Dutch display name (the `n` field in core.ts).
    public var name: String {
        switch self {
        case .idle: return "Idle"
        case .received: return "Taak received"
        case .working: return "Werken"
        case .thinking: return "Denken"
        case .waiting: return "Wachten"
        case .blocked: return "Geblokkeerd"
        case .done: return "Klaar"
        case .happy: return "Blij"
        case .sad: return "Sip"
        case .angry: return "Boos"
        case .strict: return "Streng"
        case .dancing: return "Dansen"
        case .sleepy: return "Slaperig"
        }
    }
}

public enum DashyShape: String, Codable, Sendable { case square, circle }

public struct DashyTransform: Equatable, Sendable {
    public var tx: Double, ty: Double, rot: Double, sx: Double, sy: Double
    public init(tx: Double, ty: Double, rot: Double, sx: Double, sy: Double) { self.tx = tx; self.ty = ty; self.rot = rot; self.sx = sx; self.sy = sy }
}

public struct EyeGeometry: Equatable, Sendable {
    public var x: Double, y: Double, tilt: Double, ew: Double, eh: Double
    /// fraction covered from the top by the upper lid (0...1)
    public var cov: Double
    /// upper lid rotation in degrees (positive on the left eye = angry slant)
    public var lidA: Double
    /// fraction covered from the bottom by the curved lower lid (happy arcs)
    public var low: Double
    /// current blink amount 0...1
    public var blink: Double
}

public struct Geometry: Equatable, Sendable {
    public var cur: DashyState
    /// corner radius of the body: 22 = rounded square, 110 = circle
    public var rx: Double
    public var body: DashyTransform
    public var face: DashyTransform
    public var eyes: [EyeGeometry]
}

public struct DashyError: Error, CustomStringConvertible {
    public let description: String
}

private final class Spring {
    var x: Double, v = 0.0, t: Double, k: Double, d: Double
    init(_ x: Double, _ k: Double, _ d: Double) { self.x = x; self.t = x; self.k = k; self.d = d }
    func s(_ dt: Double) { let a = (t - x) * k - v * d; v += a * dt; x += v * dt }
}

private struct Mode {
    let sd: Double, eh: Double, cover: Double, lidA: Double, low: Double, tilt: Double, asym: Double
}
// sd = sep delta, eh absolute, cover, lidA (+ = angry slant, - = sad), low, tilt, asym
private let modes: [DashyState: Mode] = [
    .idle: Mode(sd: 0, eh: 66, cover: 0.05, lidA: 0, low: 0, tilt: 0, asym: 0),
    .received: Mode(sd: 0, eh: 66, cover: 0.05, lidA: 0, low: 0, tilt: 0, asym: 0),
    .working: Mode(sd: -1, eh: 60, cover: 0.2, lidA: 4, low: 0, tilt: 0, asym: 0),
    .thinking: Mode(sd: 0, eh: 64, cover: 0.12, lidA: 8, low: 0, tilt: 0, asym: 0.22),
    .waiting: Mode(sd: 2, eh: 72, cover: 0.08, lidA: -14, low: 0, tilt: 0, asym: 0),
    .blocked: Mode(sd: 3, eh: 68, cover: 0.26, lidA: -30, low: 0, tilt: 0, asym: 0),
    .done: Mode(sd: 0, eh: 62, cover: 0, lidA: 0, low: 0.42, tilt: 7, asym: 0),
    .happy: Mode(sd: 0, eh: 68, cover: 0, lidA: 0, low: 0.26, tilt: 6, asym: 0),
    .sad: Mode(sd: 3, eh: 54, cover: 0.4, lidA: -16, low: 0, tilt: 0, asym: 0),
    .angry: Mode(sd: -2, eh: 62, cover: 0.44, lidA: 24, low: 0, tilt: 0, asym: 0),
    .strict: Mode(sd: 0, eh: 66, cover: 0.5, lidA: 3, low: 0, tilt: 0, asym: 0),
    .dancing: Mode(sd: 0, eh: 68, cover: 0, lidA: 0, low: 0.44, tilt: 7, asym: 0),
    .sleepy: Mode(sd: 2, eh: 62, cover: 0.6, lidA: -6, low: 0, tilt: 0, asym: 0),
]

@inline(__always) private func clamp(_ v: Double, _ a: Double, _ b: Double) -> Double { max(a, min(b, v)) }
@inline(__always) private func ease(_ x0: Double) -> Double { let x = clamp(x0, 0, 1); return x * x * (3 - 2 * x) }

public final class Dashy {
    private var rs: UInt32
    private let EW = 34.0, SEP = 34.0
    private let S = 1.01, H = 1.0 / 120.0

    // springs for the key properties
    private let sep: Spring, eh: Spring, cover: Spring, lidA: Spring, low: Spring, tilt: Spring, asym: Spring
    private let sx = Spring(1, 170, 11), sy = Spring(1, 170, 11), rot = Spring(0, 150, 13), tx = Spring(0, 150, 14), ty = Spring(0, 140, 10)
    private let gx = Spring(0, 140, 24), gy = Spring(0, 140, 24), fx = Spring(0, 60, 15.5), fy = Spring(0, 60, 15.5), rx = Spring(22, 120, 22)
    private let bx = Spring(0, 85, 8.5), by = Spring(0, 85, 8), bsx = Spring(1, 95, 7.5), bsy = Spring(1, 95, 7.5), brot = Spring(0, 80, 7)
    private let all: [Spring]

    // state
    private var cur: DashyState = .idle
    private var modeT = 0.0
    private var last: Double? = nil
    private var acc = 0.0
    private var nextHop = 2500.0, nextStomp = 2000.0, nextBlink = 1800.0, nextWander = 0.0, nextYawn = 5000.0, nextNo = 4500.0
    private var nextCut = 5000.0, nextScan = 0.0, nextPing = 3000.0, nextBurst = 2000.0, nextMicro = 0.0
    private var blinkStart = -1e9, blinkLen = 180.0, pokeUntil = 0.0, yawnUntil = 0.0, cutUntil = 0.0, cutDir = 1.0
    private var noStart = -1e9, pingUntil = 0.0, burstUntil = 0.0, noticeUntil = 0.0
    private var ehK: Double
    private var lastPtr = -1e9, ptx = 0.0, pty = 0.0, ptxF = 0.0, ptyF = 0.0, gtx = 0.0, gty = 0.0, msx = 0.0, msy = 0.0
    private var pokes: [Double] = []
    private var revertAt = 0.0
    private var revertTo: DashyState? = nil

    /// - Parameters:
    ///   - seed: seed for the deterministic randomness (blink timing, glances). 0 or nil = 12345, like core.ts.
    ///   - eyeScale: eye height multiplier. Default 55/66 = golden ratio with 34 wide eyes. Use 1 for 34 x 66.
    public init(seed: UInt32? = nil, eyeScale: Double? = nil) {
        rs = (seed ?? 0) == 0 ? 12345 : seed!
        ehK = eyeScale ?? 55.0 / 66.0
        let i = modes[.idle]!
        sep = Spring(34, 220, 26); eh = Spring(i.eh, 220, 26); cover = Spring(i.cover, 220, 26); lidA = Spring(i.lidA, 220, 26)
        low = Spring(i.low, 220, 26); tilt = Spring(i.tilt, 220, 26); asym = Spring(i.asym, 220, 26)
        all = [sep, eh, cover, lidA, low, tilt, asym, sx, sy, rot, tx, ty, gx, gy, fx, fy, rx, bx, by, bsx, bsy, brot]
    }

    private func R() -> Double { rs = rs &* 1664525 &+ 1013904223; return Double(rs) / 4294967296.0 }
    private func rnd(_ a: Double, _ b: Double) -> Double { a + R() * (b - a) }

    public func getState() -> DashyState { cur }

    public func setState(_ k: DashyState, now: Double) { setMode(k, now, quiet: false) }

    /// Mirrors the "unknown state throws" behaviour of core.ts for names that come from outside (JSON, a server).
    public func setState(named name: String, now: Double) throws {
        guard let k = DashyState(rawValue: name) else { throw DashyError(description: "Unknown state: \(name)") }
        setState(k, now: now)
    }

    public func setShape(_ s: DashyShape) {
        rx.t = s == .circle ? 110 : 22
        by.v = -60; bsy.v = -1.2
    }

    public func setEyeScale(_ k: Double) { ehK = k }

    private func setMode(_ k: DashyState, _ now: Double, quiet: Bool) {
        cur = k; modeT = now; noStart = -1e9; revertAt = 0
        if !quiet {
            if k == .received { ty.v = -300 }
            else if k == .done { ty.v = -380; sy.v = -2 }
            else { ty.v = -200; sy.v = -2; sx.v = 2 }
        }
    }

    public func poke(now: Double) {
        sy.v = -4; sx.v = 4; ty.v = -220; rot.v = (R() < 0.5 ? -1 : 1) * 120; pokeUntil = now + 750
        pokes = pokes.filter { now - $0 < 3000 }; pokes.append(now)
        if pokes.count >= 4 && cur != .angry {
            let prev = cur; setMode(.angry, now, quiet: false); pokes = []; revertTo = prev == .angry ? .idle : prev; revertAt = now + 3800
        }
    }

    /// nx, ny in -1...1 relative to the centre of the avatar
    public func pointer(nx: Double, ny: Double, now: Double) {
        if now - lastPtr > 2500 && (cur == .idle || cur == .waiting) { noticeUntil = now + 380 }
        ptx = clamp(nx, -1, 1); pty = clamp(ny, -1, 1); lastPtr = now
    }

    public func step(now: Double) -> Geometry {
        if last == nil { last = now; modeT = now }
        let dt = min(0.05, (now - last!) / 1000); last = now; let t = now / 1000
        if revertAt != 0 && now > revertAt, let r = revertTo { setMode(r, now, quiet: true) }
        var c = cur
        if c == .received && now - modeT > 650 { setMode(.working, now, quiet: true); c = .working }
        if c == .done && now - modeT > 3600 { setMode(.idle, now, quiet: true); c = .idle }
        let m = modes[c]!
        var Teh = m.eh, Tcover = m.cover, TlidA = m.lidA, Tlow = m.low, Ttilt = m.tilt, Tasym = m.asym
        var Tsep = SEP + m.sd
        let b = sin(t * 2.2) * 0.012
        var sxT = 1 - b, syT = 1 + b, txT = 0.0, tyT = 0.0, rotT = 0.0, amp = 1.0
        let ptrRecent = now - lastPtr < 2500
        let k1 = 1 - exp(-dt * 12); ptxF += (ptx - ptxF) * k1; ptyF += (pty - ptyF) * k1
        switch c {
        case .idle: tyT = sin(t * 1.1) * -2; rotT = sin(t * 0.5) * 1.5 + gtx * 3; amp = 0.85
        case .received: if now - modeT < 650 { Teh = 82; Tcover = 0; syT += 0.03 }
        case .working: tyT = -abs(sin(t * 12)) * 2.5; rotT = sin(t * 9) * 0.8; sxT += sin(t * 12) * 0.01; amp = 1.15
        case .thinking: rotT = -5 + sin(t * 0.8) * 1.5; tyT = -1
        case .waiting:
            rotT = 3 + sin(t * 0.9) * 5; tyT = sin(t * 1.6) * -3
            if now > nextPing { ty.v = -220; pingUntil = now + 450; nextPing = now + 3200 }
            if now < pingUntil { Teh = 82; Tcover = 0 }
        case .blocked:
            tyT = 6; rotT = -2
            if now > nextBurst { burstUntil = now + 700; nextBurst = now + 2600 }
            if now < burstUntil { txT = sin(t * 50) * 3.2 * min(1, (burstUntil - now) / 300) }
        case .done: tyT = sin(t * 2) * -3; rotT = sin(t * 1.4) * 1.5
        case .happy:
            tyT = sin(t * 2) * -3; rotT = sin(t * 1.4) * 1.5
            if now > nextHop { ty.v = -300; nextHop = now + rnd(3500, 6500) }
        case .dancing:
            let ph = t * 2 * Double.pi * 1.03
            tyT = -abs(sin(ph)) * 18 + 8; rotT = sin(ph / 2) * 7; txT = sin(ph / 2) * 8
        case .sad: tyT = 10; syT += sin(t * 1.1) * 0.02; rotT = -2 + sin(t * 0.7) * 2
        case .angry:
            txT = sin(t * 55) * 2.2; rotT = sin(t * 47) * 1.2; syT += sin(t * 9) * 0.015; amp = 0.6
            if now > nextStomp { ty.v = -200; nextStomp = now + 2400 }
        case .strict:
            if now > nextNo { noStart = now; nextNo = now + 6500 }
            let seq: [Double] = [-7, 7, -5, 5, 0]
            let ni = Int(((now - noStart) / 230).rounded(.down))
            rotT = (ni >= 0 && ni < seq.count) ? seq[ni] : 0
        case .sleepy:
            syT += sin(t * 1.1) * 0.03; sxT -= sin(t * 1.1) * 0.02; rotT = -4 + sin(t * 0.5) * 3; tyT = 8; amp = 0.2
            if now > nextYawn { yawnUntil = now + 1600; nextYawn = now + rnd(7000, 10000) }
        }
        let sq = clamp(-ty.v * 0.0007, -0.25, 0.25); syT += sq; sxT -= sq * 0.7
        let noBlink = (c == .sleepy || c == .angry), bf = c == .working ? 1.8 : 1.0
        if now > nextBlink && !noBlink {
            blinkStart = now; blinkLen = rnd(150, 200)
            nextBlink = now + (R() < 0.18 ? 330 : rnd(2000, 5200) * bf)
        }
        let bt = now - blinkStart; var blink = 0.0
        if bt >= 0 && bt < blinkLen { let cl = blinkLen * 0.38; blink = bt < cl ? ease(bt / cl) : 1 - ease((bt - cl) / (blinkLen - cl)) }
        if now < noticeUntil { Teh *= 1.12; Tcover = 0 }
        if now < yawnUntil && c == .sleepy { Tcover = 0.93; Teh = 70 }
        if now < pokeUntil { Teh = 84; Tcover = 0; Tlow = 0; Tasym = 0; Tsep += 3 }
        if c == .working {
            if now > nextScan {
                let opts: [Double] = [-1, -0.55, 0, 0.55, 1]
                gtx = opts[Int((R() * 5).rounded(.down))]; gty = rnd(-0.2, 0.5); nextScan = now + rnd(220, 520)
            }
        } else if c == .thinking { gtx = 0.6 + sin(t * 0.7) * 0.3; gty = -0.8 + sin(t * 0.5) * 0.1 }
        else if c == .blocked { gtx = -0.6; gty = 0.9 }
        else if c == .received { gtx = 0; gty = (now - modeT > 250) ? 0.8 : 0 }
        else if c == .waiting || c == .done {
            if ptrRecent { gtx = ptxF; gty = ptyF } else { gtx = 0; gty = 0.1 }
        } else {
            if ptrRecent { gtx = ptxF; gty = ptyF }
            else if now > nextWander {
                gtx = rnd(-1, 1); gty = rnd(-0.6, 0.6)
                if R() < 0.3 { gtx = 0; gty = 0 }
                nextWander = now + (c == .idle ? rnd(2500, 5500) : rnd(1600, 4000))
            }
            if c == .strict {
                if now > nextCut { cutUntil = now + 1100; cutDir = R() < 0.5 ? -1 : 1; nextCut = now + 5200 }
                if now < cutUntil { gtx = cutDir; gty = 0 }
            }
        }
        if now > nextMicro { msx = rnd(-0.06, 0.06); msy = rnd(-0.05, 0.05); nextMicro = now + rnd(300, 900) }
        let calm = (c != .working && c != .dancing && c != .angry), fast = c == .working
        gx.k = fast ? 650 : 140; gx.d = fast ? 50 : 24; gy.k = gx.k; gy.d = gx.d
        gx.t = (gtx + (calm ? msx : 0)) * 14 * amp; gy.t = (gty + (calm ? msy : 0)) * 9 * amp
        fx.t = gtx * 7 * amp; fy.t = gty * 4 * amp
        Teh *= ehK
        sep.t = Tsep; eh.t = Teh; cover.t = Tcover; lidA.t = TlidA; low.t = Tlow; tilt.t = Ttilt; asym.t = Tasym
        sx.t = sxT; sy.t = syT; rot.t = rotT; tx.t = txT; ty.t = tyT
        let gxn = clamp(gx.x / 14, -1, 1), gyn = clamp(gy.x / 9, -1, 1)
        bx.t = tx.x * 0.6 + gxn * 5; by.t = ty.x * 0.6 + gyn * 2
        bsx.t = 1 + (sx.x - 1) * 1.1; bsy.t = 1 + (sy.x - 1) * 1.1; brot.t = rot.x * 0.6 + gxn * 2.5
        acc += dt; var steps = 0
        while acc >= H && steps < 8 { for p in all { p.s(H) }; acc -= H; steps += 1 }
        if steps >= 8 { acc = 0 }
        let fol = clamp(-ty.v * 0.025, -6, 6), folx = clamp(-tx.v * 0.02, -5, 5)
        var eyes: [EyeGeometry] = []
        for i in 0..<2 {
            let gs = i == 0 ? -1.0 : 1.0, px = i == 0 ? -1.0 : 1.0, sg = i == 0 ? 1.0 : -1.0
            let side = 1 + gxn * gs * 0.06
            let ehh = max(2, eh.x * (1 - 0.9 * blink) * side), ew = EW * (1 + gxn * gs * 0.03)
            let cov = clamp(cover.x + (i == 0 ? asym.x : -asym.x * 0.5), 0, 1)
            eyes.append(EyeGeometry(x: px * sep.x + gx.x + folx, y: gy.x * 0.6 + fol - cov * ehh * 0.22, tilt: tilt.x, ew: ew, eh: ehh,
                                    cov: cov, lidA: sg * lidA.x, low: low.x, blink: blink))
        }
        return Geometry(cur: c, rx: clamp(rx.x, 0, 110),
                        body: DashyTransform(tx: 150 + bx.x, ty: 260 + by.x, rot: brot.x, sx: bsx.x, sy: bsy.x),
                        face: DashyTransform(tx: 150 + tx.x * 0.5 + fx.x, ty: 150 + ty.x * 0.5 + fy.x, rot: rot.x * 0.5,
                                             sx: S * (1 + (sx.x - 1) * 0.5), sy: S * (1 + (sy.x - 1) * 0.5)),
                        eyes: eyes)
    }
}
