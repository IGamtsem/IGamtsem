import Foundation

/// Which side won a rally.
enum Side: Equatable {
    case us, them
}

/// A volleyball skill, plus the team-level events that end a rally without a player of ours.
enum Skill: String, CaseIterable, Codable, Identifiable {
    case serve
    case reception
    case attack
    case block
    case dig
    case set
    case opponentError
    case opponentPoint
    case teamError

    var id: String { rawValue }

    /// Skills recorded against an individual player, in the order shown on the action pad.
    static let playerSkills: [Skill] = [.serve, .reception, .attack, .block, .dig, .set]

    /// Rally-ending events not tied to one of our players.
    static let teamSkills: [Skill] = [.opponentError, .opponentPoint, .teamError]

    var isTeamEvent: Bool { Skill.teamSkills.contains(self) }

    var title: String {
        switch self {
        case .serve: "Подача"
        case .reception: "Приём"
        case .attack: "Атака"
        case .block: "Блок"
        case .dig: "Защита"
        case .set: "Пас"
        case .opponentError: "Ошибка соперника"
        case .opponentPoint: "Очко соперника"
        case .teamError: "Наша ошибка"
        }
    }

    var shortTitle: String {
        switch self {
        case .serve: "Под"
        case .reception: "Пр"
        case .attack: "Атк"
        case .block: "Бл"
        case .dig: "Защ"
        case .set: "Пас"
        case .opponentError: "Ош.сопр"
        case .opponentPoint: "Оч.сопр"
        case .teamError: "Ош.ком"
        }
    }

    /// Outcomes offered for this skill on the action pad.
    var outcomes: [Outcome] {
        switch self {
        case .serve: [.perfect, .positive, .neutral, .error]
        case .reception: [.perfect, .positive, .poor, .error]
        case .attack: [.perfect, .neutral, .blocked, .error]
        case .block: [.perfect, .positive, .error]
        case .dig: [.positive, .error]
        case .set: [.positive, .poor, .error]
        case .opponentError, .opponentPoint, .teamError: [.neutral]
        }
    }
}

/// Grade of a contact, loosely following DataVolley symbols (# + ! - = /).
enum Outcome: String, CaseIterable, Codable {
    case perfect
    case positive
    case neutral
    case poor
    case error
    case blocked

    var symbol: String {
        switch self {
        case .perfect: "#"
        case .positive: "+"
        case .neutral: "!"
        case .poor: "−"
        case .error: "="
        case .blocked: "/"
        }
    }

    func title(for skill: Skill) -> String {
        switch (skill, self) {
        case (.serve, .perfect): "Эйс"
        case (.serve, .positive): "Сложная"
        case (.serve, .neutral): "В игре"
        case (.reception, .perfect): "Идеально"
        case (.reception, .positive): "Хорошо"
        case (.reception, .poor): "Плохо"
        case (.attack, .perfect): "Очко"
        case (.attack, .neutral): "В игре"
        case (.attack, .blocked): "Блок"
        case (.block, .perfect): "Очко"
        case (.block, .positive): "Касание"
        case (.dig, .positive): "Поднял"
        case (.set, .positive): "Точный"
        case (.set, .poor): "Неточный"
        case (_, .error): "Ошибка"
        default: skill.title
        }
    }
}

enum Position: String, CaseIterable, Codable, Identifiable {
    case setter
    case outside
    case opposite
    case middle
    case libero
    case universal

    var id: String { rawValue }

    var title: String {
        switch self {
        case .setter: "Связующий"
        case .outside: "Доигровщик"
        case .opposite: "Диагональный"
        case .middle: "Центральный"
        case .libero: "Либеро"
        case .universal: "Универсал"
        }
    }

    var shortTitle: String {
        switch self {
        case .setter: "СВ"
        case .outside: "ДИ"
        case .opposite: "ДГ"
        case .middle: "Ц"
        case .libero: "Л"
        case .universal: "У"
        }
    }
}

/// A single recorded action, free of persistence so scoring and stats stay testable.
struct Play: Equatable {
    var setNumber: Int
    var playerID: UUID?
    var skill: Skill
    var outcome: Outcome

    /// Who wins the rally because of this action, or nil if the rally goes on.
    var pointWinner: Side? {
        switch (skill, outcome) {
        case (.opponentError, _): .us
        case (.opponentPoint, _), (.teamError, _): .them
        case (.serve, .perfect), (.attack, .perfect), (.block, .perfect): .us
        case (.attack, .blocked): .them
        case (_, .error): .them
        default: nil
        }
    }
}
