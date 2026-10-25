import XCTest
@testable import DashyCore

/// Replays the exact inputs recorded from the TypeScript implementation (reference.json, made by
/// scripts/swift-reference.ts) and requires the same numbers. Differences can only come from the maths library (last digits).

private struct Reference: Decodable {
    struct Frame: Decodable { let t: Double; let cur: String; let g: [Double]; let small: [Double] }
    struct Sim: Decodable { let state: String; let shape: String; let seed: UInt32; let frames: [Frame] }
    struct Extras: Decodable {
        let receivedDone: [[Item]]
        let eyeScale1: [Double]
        let pause: [Double]
        let blinks: [String: Int]
    }
    enum Item: Decodable {
        case num(Double), str(String)
        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if let d = try? c.decode(Double.self) { self = .num(d) } else { self = .str(try c.decode(String.self)) }
        }
    }
    struct Event: Decodable { let type: String; let id: String?; let dueAt: Double?; let value: Bool? }
    struct Step: Decodable { let t: Double; let event: Event; let rule: String; let state: String; let wake: Double?; let later: Later }
    struct Later: Decodable { let rule: String; let state: String }
    struct DriverRef: Decodable { let start: Double; let steps: [Step] }
    let simulations: [Sim]
    let extras: Extras
    let driver: DriverRef
}

private let reference: Reference = {
    let url = Bundle.module.url(forResource: "reference", withExtension: "json")!
    return try! JSONDecoder().decode(Reference.self, from: Data(contentsOf: url))
}()

private let tolerance = 1e-6
private func close(_ a: Double, _ b: Double) -> Bool { abs(a - b) <= tolerance * (1 + abs(b)) }
private func firstMismatch(_ a: [Double], _ b: [Double]) -> String? {
    if a.count != b.count { return "length \(a.count) vs \(b.count)" }
    for i in 0..<a.count where !close(a[i], b[i]) { return "index \(i): swift \(a[i]) vs typescript \(b[i])" }
    return nil
}

final class GoldenTests: XCTestCase {
    func testThirtySecondSimulationsMatchTypeScript() {
        XCTAssertEqual(reference.simulations.count, 26)
        for sim in reference.simulations {
            let d = Dashy(seed: sim.seed); d.setShape(DashyShape(rawValue: sim.shape)!); d.setState(DashyState(rawValue: sim.state)!, now: 0)
            var i = 0, ms = 0.0, frame = 0
            while ms < 30000 {
                let a = ms / 1000; d.pointer(nx: sin(a * 1.3) * 1.4, ny: cos(a * 0.9) * 1.4, now: ms)
                let G = d.step(now: ms)
                if i % 30 == 0 {
                    let ref = sim.frames[frame]; frame += 1
                    XCTAssertEqual(ref.t, ms, accuracy: 1e-9)
                    XCTAssertEqual(G.cur.rawValue, ref.cur, "\(sim.state)/\(sim.shape) at \(ms) ms")
                    if let m = firstMismatch(flatValues(G), ref.g) { XCTFail("\(sim.state)/\(sim.shape) at \(ms) ms: \(m)"); return }
                    if let m = firstMismatch(flatValues(smallGeometry(G)), ref.small) { XCTFail("small \(sim.state)/\(sim.shape) at \(ms) ms: \(m)"); return }
                }
                i += 1; ms += 16.67
            }
            XCTAssertEqual(frame, sim.frames.count)
        }
    }

    func testReceivedDoneEyeScalePauseAndBlinkCountsMatchTypeScript() {
        let x = reference.extras
        // received -> working, done -> idle: state name every 20 frames
        let d = Dashy(seed: 2); d.setState(.idle, now: 0)
        var names: [(Double, String)] = [], ms = 0.0, i = 0
        func run(_ until: Double) { while ms < until { let G = d.step(now: ms); if i % 20 == 0 { names.append((ms, G.cur.rawValue)) }; ms += 16.67; i += 1 } }
        run(300); d.setState(.received, now: ms); run(ms + 900); d.setState(.done, now: ms); run(ms + 3800)
        XCTAssertEqual(names.count, x.receivedDone.count)
        for (n, ref) in zip(names, x.receivedDone) {
            guard case let .num(t) = ref[0], case let .str(s) = ref[1] else { return XCTFail("bad reference") }
            XCTAssertEqual(n.0, t, accuracy: 1e-9); XCTAssertEqual(n.1, s, "state at \(t) ms")
        }
        // eyeScale 1
        let e = Dashy(seed: 4, eyeScale: 1); var G = e.step(now: 0); var t = 0.0
        while t < 3000 { e.pointer(nx: 0, ny: 0, now: t); G = e.step(now: t); t += 16.67 }
        XCTAssertNil(firstMismatch(flatValues(G), x.eyeScale1))
        // a long pause
        let p = Dashy(seed: 7); p.setState(.dancing, now: 0); var t2 = 0.0
        while t2 < 1000 { _ = p.step(now: t2); t2 += 16.67 }
        XCTAssertNil(firstMismatch(flatValues(p.step(now: t2 + 30000)), x.pause))
        // blink counts
        for (name, expected) in x.blinks {
            let b = Dashy(seed: 3); b.setState(DashyState(rawValue: name)!, now: 0)
            var n = 0, inb = false, tt = 0.0
            while tt < 60000 { let on = b.step(now: tt).eyes[0].blink > 0.5; if on && !inb { n += 1 }; inb = on; tt += 16.67 }
            XCTAssertEqual(n, expected, "blinks in 60 s: \(name)")
        }
    }

    func testDriverStormMatchesTypeScript() {
        var s = DriverState(now: reference.driver.start)
        for (i, step) in reference.driver.steps.enumerated() {
            let ev = step.event
            let event: DriverEvent
            switch ev.type {
            case "taskAdded": event = .taskAdded(id: ev.id!, dueAt: ev.dueAt)
            case "taskDone": event = .taskDone(id: ev.id!)
            case "taskRemoved": event = .taskRemoved(id: ev.id!)
            case "taskDueChanged": event = .taskDueChanged(id: ev.id!, dueAt: ev.dueAt)
            case "waiting": event = .waiting(ev.value!)
            case "blocked": event = .blocked(ev.value!)
            case "break": event = .onBreak(ev.value!)
            case "working": event = .working(ev.value!)
            case "activity": event = .activity
            default: return XCTFail("unknown event \(ev.type)")
            }
            s = reduce(s, event, now: step.t)
            let r = resolve(s, now: step.t), later = resolve(s, now: step.t + 90 * 60_000)
            XCTAssertEqual(r.rule.rawValue, step.rule, "step \(i)"); XCTAssertEqual(r.state.rawValue, step.state, "step \(i)")
            XCTAssertEqual(later.rule.rawValue, step.later.rule, "step \(i) later"); XCTAssertEqual(later.state.rawValue, step.later.state, "step \(i) later")
            XCTAssertEqual(nextWakeAt(s, now: step.t), step.wake, "step \(i) wake")
        }
    }
}
