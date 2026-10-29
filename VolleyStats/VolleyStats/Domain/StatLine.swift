import Foundation

/// Outcome counts for one skill.
struct SkillTally: Equatable {
    private(set) var counts: [Outcome: Int] = [:]

    var total: Int { counts.values.reduce(0, +) }

    subscript(outcome: Outcome) -> Int { counts[outcome, default: 0] }

    mutating func add(_ outcome: Outcome) {
        counts[outcome, default: 0] += 1
    }

    static func + (lhs: SkillTally, rhs: SkillTally) -> SkillTally {
        var result = lhs
        result.counts.merge(rhs.counts, uniquingKeysWith: +)
        return result
    }
}

/// Aggregated statistics for a player, or for the whole team.
struct StatLine: Equatable {
    private(set) var tallies: [Skill: SkillTally] = [:]

    init() {}

    init<S: Sequence>(plays: S) where S.Element == Play {
        for play in plays { add(play) }
    }

    mutating func add(_ play: Play) {
        tallies[play.skill, default: SkillTally()].add(play.outcome)
    }

    func tally(_ skill: Skill) -> SkillTally { tallies[skill] ?? SkillTally() }

    var serve: SkillTally { tally(.serve) }
    var reception: SkillTally { tally(.reception) }
    var attack: SkillTally { tally(.attack) }
    var block: SkillTally { tally(.block) }
    var dig: SkillTally { tally(.dig) }
    var setting: SkillTally { tally(.set) }

    var aces: Int { serve[.perfect] }
    var kills: Int { attack[.perfect] }
    var blockPoints: Int { block[.perfect] }

    /// Points won directly: aces, kills and stuff blocks.
    var points: Int { aces + kills + blockPoints }

    /// Actions of ours that handed the rally to the opponent.
    var errors: Int {
        Skill.playerSkills.reduce(0) { $0 + tally($1)[.error] } + attack[.blocked]
    }

    var plusMinus: Int { points - errors }

    /// Kills per attack attempt.
    var killRate: Double? { ratio(kills, attack.total) }

    /// (kills − errors − blocked) / attempts, the usual attack efficiency.
    var attackEfficiency: Double? {
        ratio(kills - attack[.error] - attack[.blocked], attack.total)
    }

    var aceRate: Double? { ratio(aces, serve.total) }
    var serveErrorRate: Double? { ratio(serve[.error], serve.total) }

    /// Perfect plus good receptions.
    var receptionPositiveRate: Double? {
        ratio(reception[.perfect] + reception[.positive], reception.total)
    }

    var receptionPerfectRate: Double? { ratio(reception[.perfect], reception.total) }

    private func ratio(_ part: Int, _ whole: Int) -> Double? {
        whole > 0 ? Double(part) / Double(whole) : nil
    }

    static func + (lhs: StatLine, rhs: StatLine) -> StatLine {
        var result = lhs
        result.tallies.merge(rhs.tallies, uniquingKeysWith: +)
        return result
    }
}

enum StatFormat {
    static func percent(_ value: Double?) -> String {
        guard let value else { return "—" }
        return "\(Int((value * 100).rounded()))%"
    }

    static func signed(_ value: Int) -> String {
        value > 0 ? "+\(value)" : "\(value)"
    }
}
