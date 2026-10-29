import Foundation

struct PlayerInfo: Equatable {
    var number: Int?
    var name: String
}

struct StatsRow: Identifiable, Equatable {
    var id: String
    var number: Int?
    var name: String
    var line: StatLine
}

struct StatsTable: Equatable {
    var players: [StatsRow]
    var team: StatsRow

    /// Builds per-player rows (only players with at least one action) plus a team total.
    /// `setNumber == nil` means the whole match.
    init(plays: [Play], players info: [UUID: PlayerInfo], setNumber: Int? = nil) {
        let scoped = plays.filter { setNumber == nil || $0.setNumber == setNumber }
        let byPlayer = Dictionary(grouping: scoped.filter { $0.playerID != nil }, by: { $0.playerID! })
        players = byPlayer
            .map { (uid, own) -> StatsRow in
                let player = info[uid] ?? PlayerInfo(number: nil, name: "Игрок")
                return StatsRow(id: uid.uuidString, number: player.number, name: player.name, line: StatLine(plays: own))
            }
            .sorted { ($0.number ?? .max, $0.name) < ($1.number ?? .max, $1.name) }
        team = StatsRow(id: "team", number: nil, name: "Команда", line: StatLine(plays: scoped))
    }
}

struct StatColumn: Identifiable {
    var title: String
    var value: (StatLine) -> String

    var id: String { title }

    static func count(_ title: String, _ value: @escaping (StatLine) -> Int) -> StatColumn {
        StatColumn(title: title) { "\(value($0))" }
    }

    static func percent(_ title: String, _ value: @escaping (StatLine) -> Double?) -> StatColumn {
        StatColumn(title: title) { StatFormat.percent(value($0)) }
    }
}

enum StatCategory: String, CaseIterable, Identifiable {
    case summary
    case attack
    case serve
    case reception
    case block
    case defense

    var id: String { rawValue }

    var title: String {
        switch self {
        case .summary: "Итого"
        case .attack: "Атака"
        case .serve: "Подача"
        case .reception: "Приём"
        case .block: "Блок"
        case .defense: "Защита"
        }
    }

    var columns: [StatColumn] {
        switch self {
        case .summary:
            return [
                .count("Очки") { $0.points },
                .count("Эйс") { $0.aces },
                .count("Атк") { $0.kills },
                .count("Блк") { $0.blockPoints },
                .count("Ош") { $0.errors },
                StatColumn(title: "+/−") { StatFormat.signed($0.plusMinus) },
            ]
        case .attack:
            return [
                .count("Всего") { $0.attack.total },
                .count("Очко") { $0.kills },
                .count("Ош") { $0.attack[.error] },
                .count("Блок") { $0.attack[.blocked] },
                .percent("Рез%") { $0.killRate },
                .percent("Эфф%") { $0.attackEfficiency },
            ]
        case .serve:
            return [
                .count("Всего") { $0.serve.total },
                .count("Эйс") { $0.aces },
                .count("Слож") { $0.serve[.positive] },
                .count("Ош") { $0.serve[.error] },
                .percent("Эйс%") { $0.aceRate },
                .percent("Ош%") { $0.serveErrorRate },
            ]
        case .reception:
            return [
                .count("Всего") { $0.reception.total },
                .count("#") { $0.reception[.perfect] },
                .count("+") { $0.reception[.positive] },
                .count("−") { $0.reception[.poor] },
                .count("Ош") { $0.reception[.error] },
                .percent("Пол%") { $0.receptionPositiveRate },
                .percent("Отл%") { $0.receptionPerfectRate },
            ]
        case .block:
            return [
                .count("Очко") { $0.blockPoints },
                .count("Кас") { $0.block[.positive] },
                .count("Ош") { $0.block[.error] },
            ]
        case .defense:
            return [
                .count("Защ") { $0.dig.total },
                .count("Ош") { $0.dig[.error] },
                .count("Пас") { $0.setting.total },
                .count("Неточ") { $0.setting[.poor] },
                .count("Ош.пас") { $0.setting[.error] },
            ]
        }
    }
}
