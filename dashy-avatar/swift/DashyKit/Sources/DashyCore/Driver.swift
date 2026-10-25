import Foundation

/// Port of src/driver.ts: translates app events into one Dashy state. Pure: you pass the time (ms), nothing is read from a clock.

public enum DriverRule: String, CaseIterable, Codable, Sendable {
    case done, received, blocked, deadlineSoon, deadlineNear, waiting, `break`, working, quiet, idle
}

/// Highest priority first. The first rule that applies wins, so two rules never fight.
public let driverRules: [(rule: DriverRule, state: DashyState)] = [
    (.done, .done), (.received, .received), (.blocked, .blocked), (.deadlineNear, .angry), (.deadlineSoon, .strict),
    (.waiting, .waiting), (.break, .sleepy), (.working, .working), (.quiet, .sad), (.idle, .idle),
]

public struct DriverConfig: Sendable {
    public var strictWithinMs = 60.0 * 60_000
    public var angryWithinMs = 15.0 * 60_000
    public var overdueGraceMs = 15.0 * 60_000
    public var quietAfterMs = 60.0 * 60_000
    public var doneMs = 3600.0
    public var receivedMs = 650.0
    public init() {}
}

public enum DriverEvent: Sendable {
    case taskAdded(id: String, dueAt: Double?)
    case taskDone(id: String)
    case taskRemoved(id: String)
    case taskDueChanged(id: String, dueAt: Double?)
    case waiting(Bool)
    case blocked(Bool)
    case onBreak(Bool)
    case working(Bool)
    case activity
}

public struct DriverState: Sendable {
    /// Open tasks: id -> due time (ms) or nil.
    public var tasks: [String: Double?] = [:]
    public var receivedAt: Double?
    public var doneAt: Double?
    public var waiting = false, blocked = false, onBreak = false, working = false
    public var lastActivityAt: Double
    public init(now: Double) { lastActivityAt = now }
}

public struct Resolution: Equatable, Sendable {
    public let state: DashyState
    public let rule: DriverRule
}

public func reduce(_ s: DriverState, _ e: DriverEvent, now: Double) -> DriverState {
    var n = s
    switch e {
    case let .taskAdded(id, dueAt): n.tasks[id] = .some(dueAt); n.receivedAt = now; n.lastActivityAt = now
    case let .taskDone(id): n.tasks.removeValue(forKey: id); n.doneAt = now; n.lastActivityAt = now
    case let .taskRemoved(id): n.tasks.removeValue(forKey: id)
    case let .taskDueChanged(id, dueAt): if n.tasks[id] != nil { n.tasks[id] = .some(dueAt); n.lastActivityAt = now }
    case let .waiting(v): n.waiting = v
    case let .blocked(v): n.blocked = v
    // Coming back from a break counts as activity, so Dashy is not sad the moment you return.
    case let .onBreak(v): n.onBreak = v; if !v { n.lastActivityAt = now }
    case let .working(v): n.working = v; if v { n.lastActivityAt = now }
    case .activity: n.lastActivityAt = now
    }
    return n
}

private func nearestDue(_ s: DriverState, _ now: Double, _ c: DriverConfig) -> Double? {
    var best: Double? = nil
    for (_, due) in s.tasks {
        guard let due = due, now - due <= c.overdueGraceMs else { continue }
        if best == nil || due < best! { best = due }
    }
    return best
}

public func resolve(_ s: DriverState, now: Double, config: DriverConfig = DriverConfig()) -> Resolution {
    let c = config
    let left = nearestDue(s, now, c).map { $0 - now } ?? Double.infinity
    let applies: [DriverRule: Bool] = [
        .done: s.doneAt.map { now - $0 < c.doneMs } ?? false,
        .received: s.receivedAt.map { now - $0 < c.receivedMs } ?? false,
        .blocked: s.blocked,
        .deadlineNear: left <= c.angryWithinMs,
        .deadlineSoon: left <= c.strictWithinMs,
        .waiting: s.waiting,
        .break: s.onBreak,
        .working: s.working,
        .quiet: now - s.lastActivityAt >= c.quietAfterMs,
        .idle: true,
    ]
    let hit = driverRules.first { applies[$0.rule] == true }!
    return Resolution(state: hit.state, rule: hit.rule)
}

/// The next moment (ms) at which the result may change by itself, or nil when it only changes on an event.
public func nextWakeAt(_ s: DriverState, now: Double, config: DriverConfig = DriverConfig()) -> Double? {
    let c = config
    var t: [Double] = []
    if let d = s.doneAt { t.append(d + c.doneMs) }
    if let r = s.receivedAt { t.append(r + c.receivedMs) }
    for (_, due) in s.tasks {
        guard let due = due else { continue }
        t.append(contentsOf: [due - c.strictWithinMs, due - c.angryWithinMs, due + c.overdueGraceMs + 1])
    }
    if !s.onBreak { t.append(s.lastActivityAt + c.quietAfterMs) }
    return t.filter { $0 > now }.min()
}
