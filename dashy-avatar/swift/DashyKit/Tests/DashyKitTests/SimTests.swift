import XCTest
@testable import DashyCore

/// Swift versions of the scenarios in tests/sim.test.ts (the specification), assertion for assertion.

private func rot(_ p: (Double, Double), _ deg: Double) -> (Double, Double) {
    let a = deg * Double.pi / 180, c = cos(a), s = sin(a)
    return (p.0 * c - p.1 * s, p.0 * s + p.1 * c)
}
private func eyeCorners(_ e: EyeGeometry) -> [(Double, Double)] {
    [(-e.ew / 2, -e.eh / 2), (e.ew / 2, -e.eh / 2), (e.ew / 2, e.eh / 2), (-e.ew / 2, e.eh / 2)].map { p in
        let r = rot(p, e.tilt); return (r.0 + e.x, r.1 + e.y)
    }
}
private func toFace(_ G: Geometry, _ p: (Double, Double)) -> (Double, Double) {
    let f = G.face; let q = rot((p.0 * f.sx, p.1 * f.sy), f.rot); return (q.0 + f.tx, q.1 + f.ty)
}
func flatValues(_ G: Geometry) -> [Double] {
    [G.rx, G.body.tx, G.body.ty, G.body.rot, G.body.sx, G.body.sy, G.face.tx, G.face.ty, G.face.rot, G.face.sx, G.face.sy]
        + G.eyes.flatMap { [$0.x, $0.y, $0.tilt, $0.ew, $0.eh, $0.cov, $0.lidA, $0.low, $0.blink] }
}

final class SimTests: XCTestCase {
    func testSimulation30sStaysFiniteSmoothInsideTheBody() {
        for shape in [DashyShape.square, .circle] {
            for state in DashyState.allCases {
                let d = Dashy(seed: 7); d.setShape(shape); d.setState(state, now: 0)
                var prev: Geometry? = nil
                var maxEdge = -1e9, maxJump = 0.0, minGap = 1e9
                var ms = 0.0
                while ms < 30000 {
                    let a = ms / 1000; d.pointer(nx: sin(a * 1.3) * 1.4, ny: cos(a * 0.9) * 1.4, now: ms)
                    let G = d.step(now: ms)
                    XCTAssertTrue(flatValues(G).allSatisfy { $0.isFinite }, "no NaN/Infinity (\(state), \(shape))")
                    for e in G.eyes { for c in eyeCorners(e) {
                        let p = toFace(G, c), dx = p.0 - 150, dy = p.1 - 150
                        maxEdge = max(maxEdge, shape == .circle ? hypot(dx, dy) - 110 : max(abs(dx), abs(dy)) - 110)
                    } }
                    let L = eyeCorners(G.eyes[0]), R = eyeCorners(G.eyes[1])
                    minGap = min(minGap, (R.map { $0.0 }.min()! - L.map { $0.0 }.max()!) * G.face.sx)
                    if let p = prev { maxJump = max(maxJump, abs(G.eyes[0].x - p.eyes[0].x) + abs(G.eyes[0].y - p.eyes[0].y)) }
                    prev = G; ms += 16.67
                }
                XCTAssertLessThan(maxEdge, -10, "eyes keep >=10px from the body edge (\(state), \(shape): \(maxEdge))")
                XCTAssertGreaterThan(minGap, 18, "eyes never touch (\(state), \(shape): \(minGap))")
                XCTAssertLessThan(maxJump, 9, "no teleporting eyes (\(state), \(shape): \(maxJump))")
            }
        }
    }

    func testFourPokesWithin3sMakeDashyAngryThenHeReturns() {
        let d = Dashy(seed: 1); d.setState(.happy, now: 0)
        var ms = 0.0
        while ms < 500 { _ = d.step(now: ms); ms += 16.67 }
        for t in [500.0, 800, 1100, 1400] { while ms < t { _ = d.step(now: ms); ms += 16.67 }; d.poke(now: t) }
        while ms < 2000 { _ = d.step(now: ms); ms += 16.67 }
        XCTAssertEqual(d.getState(), .angry)
        while ms < 6500 { _ = d.step(now: ms); ms += 16.67 }
        XCTAssertEqual(d.getState(), .happy)
    }

    func testReceivedGoesToWorkingAndDoneGoesToIdleAutomatically() {
        let d = Dashy(seed: 2); d.setState(.idle, now: 0)
        var ms = 0.0
        while ms < 300 { _ = d.step(now: ms); ms += 16.67 }
        d.setState(.received, now: ms); var t0 = ms
        while ms < t0 + 900 { _ = d.step(now: ms); ms += 16.67 }
        XCTAssertEqual(d.getState(), .working)
        d.setState(.done, now: ms); t0 = ms
        while ms < t0 + 3800 { _ = d.step(now: ms); ms += 16.67 }
        XCTAssertEqual(d.getState(), .idle)
    }

    func testBlinkingIdle10To30PerMinuteAngryAndSleepyNever() {
        func count(_ state: DashyState) -> Int {
            let d = Dashy(seed: 3); d.setState(state, now: 0)
            var n = 0, inb = false, ms = 0.0
            while ms < 60000 { let b = d.step(now: ms).eyes[0].blink > 0.5; if b && !inb { n += 1 }; inb = b; ms += 16.67 }
            return n
        }
        let idle = count(.idle)
        XCTAssertTrue(idle >= 10 && idle <= 30, "idle blinks \(idle)")
        XCTAssertEqual(count(.angry), 0); XCTAssertEqual(count(.sleepy), 0)
    }

    func testShapeMorphSettlesToExactRadii() {
        let d = Dashy(seed: 5); var ms = 0.0; var G = d.step(now: 0)
        d.setShape(.circle); while ms < 2000 { G = d.step(now: ms); ms += 16.67 }
        XCTAssertLessThan(abs(G.rx - 110), 0.5)
        d.setShape(.square); while ms < 4000 { G = d.step(now: ms); ms += 16.67 }
        XCTAssertLessThan(abs(G.rx - 22), 0.5)
    }

    func testALongPauseDoesNotBlowUpTheSimulation() {
        let d = Dashy(seed: 7); d.setState(.dancing, now: 0); var ms = 0.0
        while ms < 1000 { _ = d.step(now: ms); ms += 16.67 }
        let G = d.step(now: ms + 30000)
        XCTAssertTrue(G.body.ty.isFinite && abs(G.body.ty - 260) < 60)
    }

    func testLidSlantDirection() {
        func settle(_ s: DashyState) -> Geometry {
            let d = Dashy(seed: 9); d.setState(s, now: 0); var G = d.step(now: 0); var ms = 0.0
            while ms < 3000 { G = d.step(now: ms); ms += 16.67 }
            return G
        }
        XCTAssertGreaterThan(settle(.angry).eyes[0].lidA, 10, "angry left lid > 10deg")
        XCTAssertLessThan(settle(.sad).eyes[0].lidA, -8, "sad left lid < -8deg")
        let a = settle(.angry); XCTAssertLessThan(a.eyes[0].lidA * a.eyes[1].lidA, 0, "eyes mirror each other")
    }

    func testGoldenRatioDefaultIdleEyeIs34x55() {
        let d = Dashy(seed: 4); var G = d.step(now: 0); var ms = 0.0
        while ms < 3000 { d.pointer(nx: 0, ny: 0, now: ms); G = d.step(now: ms); ms += 16.67 }
        let open = G.eyes[0]
        XCTAssertLessThan(abs(open.eh / open.ew - 1.618), 0.12, "ratio \(open.eh / open.ew)")
    }

    func testUnknownStateThrowsAClearError() {
        XCTAssertThrowsError(try Dashy().setState(named: "banana", now: 0)) { error in
            XCTAssertTrue("\(error)".contains("Unknown state"))
        }
        XCTAssertNoThrow(try Dashy().setState(named: "happy", now: 0))
    }
}
