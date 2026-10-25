import XCTest
@testable import DashyCore

final class SmallVariantTests: XCTestCase {
    func testBodyStaysStillAndEyesStayLegibleInAllStates() {
        let px24 = 24.0 / 300
        for state in DashyState.allCases {
            let d = Dashy(seed: 7); d.setState(state, now: 0)
            var ms = 0.0
            while ms < 30000 {
                let a = ms / 1000; d.pointer(nx: sin(a * 1.3) * 1.4, ny: cos(a * 0.9) * 1.4, now: ms)
                let full = d.step(now: ms), G = smallGeometry(full)
                XCTAssertEqual(G.body, DashyTransform(tx: 150, ty: 260, rot: 0, sx: 1, sy: 1))
                XCTAssertEqual(G.face.rot, 0)
                XCTAssertEqual(G.cur, full.cur)
                for e in G.eyes where e.blink <= 0.05 {
                    XCTAssertEqual(e.tilt, 0)
                    if e.cov > 0 { XCTAssertGreaterThanOrEqual(e.cov * e.eh * px24, 1, "\(state) lid") }
                    if e.low > 0.001 { XCTAssertGreaterThanOrEqual(e.low * e.eh * px24, 1, "\(state) lower lid") }
                }
                ms += 16.67 * 10
            }
        }
    }

    func testMoodsStayDifferentInTheSmallDrawing() {
        func settle(_ s: DashyState) -> EyeGeometry {
            let d = Dashy(seed: 9); d.setState(s, now: 0); var G = d.step(now: 0); var ms = 0.0
            while ms < 3000 { G = smallGeometry(d.step(now: ms)); ms += 16.67 }
            return G.eyes[0]
        }
        XCTAssertGreaterThan(settle(.angry).lidA, 15); XCTAssertLessThan(settle(.sad).lidA, -10)
        XCTAssertGreaterThan(settle(.angry).cov, settle(.idle).cov); XCTAssertGreaterThan(settle(.sleepy).cov, settle(.strict).cov)
        XCTAssertGreaterThanOrEqual(settle(.happy).low, 0.4); XCTAssertEqual(settle(.idle).low, 0)
        XCTAssertEqual(settle(.idle).cov, 0, "a barely-there idle lid is dropped, not thickened")
    }
}

final class DriverTests: XCTestCase {
    let MIN = 60_000.0, T0 = 1_000_000.0
    func run(_ events: [(Double, DriverEvent)]) -> DriverState { events.reduce(DriverState(now: T0)) { reduce($0, $1.1, now: $1.0) } }

    func testFreshDriverIsIdle() { XCTAssertEqual(resolve(DriverState(now: T0), now: T0), Resolution(state: .idle, rule: .idle)) }

    func testReceivedAndDoneWindows() {
        let s = run([(T0, .taskAdded(id: "a", dueAt: nil)), (T0 + 5000, .taskDone(id: "a"))])
        XCTAssertEqual(resolve(s, now: T0 + 5000).state, .done)
        XCTAssertEqual(resolve(s, now: T0 + 5000 + 3599).state, .done)
        XCTAssertEqual(resolve(s, now: T0 + 5000 + 3600).state, .idle)
        let r = run([(T0, .taskAdded(id: "a", dueAt: nil))])
        XCTAssertEqual(resolve(r, now: T0 + 649).state, .received); XCTAssertEqual(resolve(r, now: T0 + 650).state, .idle)
    }

    func testDeadlineThresholdsAreInclusive() {
        let due = T0 + 90 * MIN
        let s = run([(T0, .taskAdded(id: "a", dueAt: due))])
        XCTAssertEqual(resolve(s, now: due - 61 * MIN).state, .idle)
        XCTAssertEqual(resolve(s, now: due - 60 * MIN).state, .strict)
        XCTAssertEqual(resolve(s, now: due - 16 * MIN).state, .strict)
        XCTAssertEqual(resolve(s, now: due - 15 * MIN).state, .angry)
        XCTAssertEqual(resolve(s, now: due).state, .angry)
    }

    func testOverdueStaysAngry15MinutesThenIsIgnored() {
        let due = T0 + 20 * MIN
        let s = run([(T0, .taskAdded(id: "a", dueAt: due))])
        XCTAssertEqual(resolve(s, now: due + 15 * MIN).state, .angry)
        XCTAssertEqual(resolve(s, now: due + 15 * MIN + 1).state, .idle)
    }

    func testAnHourOfNothingIsSadAndABreakIsNeverSad() {
        let s = DriverState(now: T0)
        XCTAssertEqual(resolve(s, now: T0 + 60 * MIN - 1).state, .idle)
        XCTAssertEqual(resolve(s, now: T0 + 60 * MIN).state, .sad)
        var b = reduce(s, .onBreak(true), now: T0)
        XCTAssertEqual(resolve(b, now: T0 + 5 * 60 * MIN).state, .sleepy)
        b = reduce(b, .onBreak(false), now: T0 + 5 * 60 * MIN)
        XCTAssertEqual(resolve(b, now: T0 + 5 * 60 * MIN).state, .idle)
        XCTAssertEqual(resolve(b, now: T0 + 6 * 60 * MIN).state, .sad)
    }

    func testPriorityEveryRuleBeatsAllRulesBelowIt() {
        func scene(_ r: DriverRule) -> [(Double, DriverEvent)] {
            switch r {
            case .done: return [(T0 + 10, .taskDone(id: "x"))]
            case .received: return [(T0 + 10, .taskAdded(id: "y", dueAt: nil))]
            case .blocked: return [(T0 + 10, .blocked(true))]
            case .deadlineNear: return [(T0 - 5000, .taskAdded(id: "near", dueAt: T0 + 10 * MIN))]
            case .deadlineSoon: return [(T0 - 5000, .taskAdded(id: "soon", dueAt: T0 + 40 * MIN))]
            case .waiting: return [(T0 + 10, .waiting(true))]
            case .break: return [(T0 + 10, .onBreak(true))]
            case .working: return [(T0 + 10, .working(true))]
            default: return []
            }
        }
        let testable = Array(driverRules.prefix(8))
        for i in 0..<testable.count { for j in (i + 1)..<testable.count {
            let events = (scene(testable[i].rule) + scene(testable[j].rule)).sorted { $0.0 < $1.0 }
            XCTAssertEqual(resolve(run(events), now: T0 + 100).rule, testable[i].rule, "\(testable[i].rule) should beat \(testable[j].rule)")
        } }
    }

    func testNextWakeStepsThroughTheDeadlineSequence() {
        let s = run([(T0, .taskAdded(id: "a", dueAt: T0 + 120 * MIN))])
        var now = T0 + 1, last = resolve(s, now: now).rule
        var seen = [last]
        for _ in 0..<20 {
            guard let wake = nextWakeAt(s, now: now) else { break }
            XCTAssertGreaterThan(wake, now)
            XCTAssertEqual(resolve(s, now: wake - 1).rule, last, "nothing changes before the wake time")
            let next = resolve(s, now: wake).rule
            XCTAssertNotEqual(next, last); last = next; now = wake; seen.append(next)
        }
        XCTAssertEqual(seen, [.received, .idle, .deadlineSoon, .deadlineNear, .quiet])
    }
}
