import Foundation

struct MatchRules: Equatable {
    var bestOf: Int = 5
    var pointsPerSet: Int = 25
    var decidingSetPoints: Int = 15

    var setsToWin: Int { bestOf / 2 + 1 }

    func target(forSet number: Int) -> Int {
        number == bestOf ? decidingSetPoints : pointsPerSet
    }

    /// Winner of a set by the rules (target reached with a two-point lead), or nil if it is still on.
    func winner(us: Int, them: Int, set number: Int) -> Side? {
        let target = target(forSet: number)
        if us >= target && us - them >= 2 { return .us }
        if them >= target && them - us >= 2 { return .them }
        return nil
    }
}

struct SetScore: Identifiable, Equatable {
    var number: Int
    var us: Int
    var them: Int
    var isCompleted: Bool

    var id: Int { number }

    /// For a completed set the side with more points; nil while the set is in progress or tied.
    var winner: Side? {
        guard isCompleted, us != them else { return nil }
        return us > them ? .us : .them
    }
}

/// Score of a match derived from its plays. Nothing about the score is stored separately,
/// so deleting or undoing a play always leaves a consistent scoreboard.
struct Scoreboard: Equatable {
    var rules: MatchRules
    var currentSet: Int
    var sets: [SetScore]

    init(plays: [Play], rules: MatchRules, currentSet: Int, isFinished: Bool) {
        let currentSet = max(currentSet, 1)
        self.rules = rules
        self.currentSet = currentSet
        var us = Array(repeating: 0, count: currentSet + 1)
        var them = Array(repeating: 0, count: currentSet + 1)
        for play in plays where (1...currentSet).contains(play.setNumber) {
            switch play.pointWinner {
            case .us: us[play.setNumber] += 1
            case .them: them[play.setNumber] += 1
            case nil: break
            }
        }
        sets = (1...currentSet).map { number in
            SetScore(
                number: number,
                us: us[number],
                them: them[number],
                isCompleted: number < currentSet || isFinished
            )
        }
    }

    var current: SetScore { sets[sets.count - 1] }

    var setsWonByUs: Int { sets.filter { $0.winner == .us }.count }
    var setsWonByThem: Int { sets.filter { $0.winner == .them }.count }

    /// Non-nil once the current set has reached its target with a two-point lead.
    var currentSetWinnerByRules: Side? {
        rules.winner(us: current.us, them: current.them, set: currentSet)
    }

    /// Whether closing the current set in favour of `side` also decides the match.
    func closingSetEndsMatch(winner side: Side) -> Bool {
        let won = side == .us ? setsWonByUs : setsWonByThem
        return won + 1 >= rules.setsToWin
    }
}
