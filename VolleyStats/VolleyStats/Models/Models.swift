import Foundation
import SwiftData

@Model
final class Team {
    var name: String
    var createdAt: Date
    @Relationship(deleteRule: .cascade, inverse: \Player.team)
    var players: [Player] = []
    @Relationship(deleteRule: .nullify, inverse: \Match.team)
    var matches: [Match] = []

    init(name: String) {
        self.name = name
        self.createdAt = .now
    }

    var roster: [Player] {
        players.sorted { ($0.number, $0.name) < ($1.number, $1.name) }
    }
}

@Model
final class Player {
    /// Stable identity that recorded events point to, so history survives roster edits.
    var uid: UUID
    var name: String
    var number: Int
    var positionRaw: String
    var team: Team?

    init(name: String, number: Int, position: Position) {
        self.uid = UUID()
        self.name = name
        self.number = number
        self.positionRaw = position.rawValue
    }

    var position: Position {
        get { Position(rawValue: positionRaw) ?? .universal }
        set { positionRaw = newValue.rawValue }
    }
}

@Model
final class Match {
    var date: Date
    var opponent: String
    var tournament: String
    /// Copy of the team name, kept in case the team is deleted later.
    var teamName: String
    var bestOf: Int
    var pointsPerSet: Int
    var decidingSetPoints: Int
    var currentSet: Int
    var isFinished: Bool
    var team: Team?
    @Relationship(deleteRule: .cascade, inverse: \StatEvent.match)
    var events: [StatEvent] = []

    init(teamName: String, opponent: String, tournament: String, date: Date, rules: MatchRules) {
        self.date = date
        self.opponent = opponent
        self.tournament = tournament
        self.teamName = teamName
        self.bestOf = rules.bestOf
        self.pointsPerSet = rules.pointsPerSet
        self.decidingSetPoints = rules.decidingSetPoints
        self.currentSet = 1
        self.isFinished = false
    }

    var rules: MatchRules {
        MatchRules(bestOf: bestOf, pointsPerSet: pointsPerSet, decidingSetPoints: decidingSetPoints)
    }

    /// SwiftData does not keep to-many relationships ordered, so always go through this.
    var orderedEvents: [StatEvent] { events.sorted { $0.seq < $1.seq } }

    var plays: [Play] { orderedEvents.map(\.play) }

    var scoreboard: Scoreboard {
        Scoreboard(plays: plays, rules: rules, currentSet: currentSet, isFinished: isFinished)
    }

    var displayTeamName: String { team?.name ?? teamName }
}

@Model
final class StatEvent {
    /// Monotonic order within the match.
    var seq: Int
    var timestamp: Date
    var setNumber: Int
    var skillRaw: String
    var outcomeRaw: String
    var playerUID: UUID?
    var playerNumber: Int?
    var playerName: String?
    var match: Match?

    init(seq: Int, setNumber: Int, skill: Skill, outcome: Outcome, player: Player?) {
        self.seq = seq
        self.timestamp = .now
        self.setNumber = setNumber
        self.skillRaw = skill.rawValue
        self.outcomeRaw = outcome.rawValue
        self.playerUID = player?.uid
        self.playerNumber = player?.number
        self.playerName = player?.name
    }

    var skill: Skill { Skill(rawValue: skillRaw) ?? .teamError }
    var outcome: Outcome { Outcome(rawValue: outcomeRaw) ?? .neutral }

    var play: Play {
        Play(setNumber: setNumber, playerID: playerUID, skill: skill, outcome: outcome)
    }

    var summary: String {
        if skill.isTeamEvent { return skill.title }
        let who = playerNumber.map { "#\($0) " } ?? ""
        return "\(who)\(playerName ?? "") · \(skill.title): \(outcome.title(for: skill))"
    }
}
