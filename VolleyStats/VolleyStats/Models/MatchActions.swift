import Foundation
import SwiftData

extension Match {
    @discardableResult
    func record(_ skill: Skill, _ outcome: Outcome, by player: Player?, in context: ModelContext) -> StatEvent {
        let nextSeq = (events.map(\.seq).max() ?? 0) + 1
        let event = StatEvent(seq: nextSeq, setNumber: currentSet, skill: skill, outcome: outcome, player: player)
        context.insert(event)
        event.match = self
        return event
    }

    /// Removes the latest event. If the current set is still empty, the previous set is reopened first.
    func undoLast(in context: ModelContext) {
        guard let last = orderedEvents.last else { return }
        if last.setNumber < currentSet && !events.contains(where: { $0.setNumber == currentSet }) {
            currentSet = last.setNumber
        }
        isFinished = false
        context.delete(last)
    }

    /// Closes the current set. Finishes the match when one side has enough sets.
    func closeCurrentSet() {
        let board = scoreboard
        let current = board.current
        guard current.us != current.them else { return }
        let winner: Side = current.us > current.them ? .us : .them
        if board.closingSetEndsMatch(winner: winner) || currentSet >= bestOf {
            isFinished = true
        } else {
            currentSet += 1
        }
    }

    func reopen() {
        isFinished = false
    }
}

extension Team {
    static func makeDemo(in context: ModelContext) -> Team {
        let team = Team(name: "Демо-команда")
        context.insert(team)
        let roster: [(String, Int, Position)] = [
            ("Иванов", 1, .setter),
            ("Петров", 4, .outside),
            ("Сидоров", 7, .outside),
            ("Смирнов", 9, .opposite),
            ("Кузнецов", 11, .middle),
            ("Попов", 13, .middle),
            ("Васильев", 17, .libero),
        ]
        for (name, number, position) in roster {
            let player = Player(name: name, number: number, position: position)
            context.insert(player)
            player.team = team
        }
        return team
    }
}
