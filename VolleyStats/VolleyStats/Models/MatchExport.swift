import CoreTransferable
import Foundation
import UniformTypeIdentifiers

extension Match {
    /// Names and numbers for everyone who appears in this match. Current roster data wins over
    /// the snapshot stored on events, so renaming a player updates old matches too.
    var playerInfo: [UUID: PlayerInfo] {
        var info: [UUID: PlayerInfo] = [:]
        for event in orderedEvents {
            guard let uid = event.playerUID else { continue }
            info[uid] = PlayerInfo(number: event.playerNumber, name: event.playerName ?? "Игрок")
        }
        for player in team?.players ?? [] where info[player.uid] != nil {
            info[player.uid] = PlayerInfo(number: player.number, name: player.name)
        }
        return info
    }

    func statsTable(setNumber: Int? = nil) -> StatsTable {
        StatsTable(plays: plays, players: playerInfo, setNumber: setNumber)
    }
}

/// Match statistics as a semicolon-separated CSV (opens correctly in Excel with a Russian locale).
struct CSVExport: Transferable {
    var fileName: String
    var text: String

    init(match: Match) {
        fileName = CSVExport.fileName(for: match)
        text = CSVExport.render(match)
    }

    static func fileName(for match: Match) -> String {
        let day = match.date.formatted(.iso8601.year().month().day())
        let opponent = match.opponent
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "_")
        return "volley_\(day)_\(opponent.isEmpty ? "match" : opponent).csv"
    }

    static func render(_ match: Match) -> String {
        let board = match.scoreboard
        let table = match.statsTable()
        let categories = StatCategory.allCases
        var lines: [String] = []

        lines.append(row(["Матч", "\(match.displayTeamName) — \(match.opponent)"]))
        lines.append(row(["Дата", match.date.formatted(date: .numeric, time: .shortened)]))
        if !match.tournament.isEmpty {
            lines.append(row(["Турнир", match.tournament]))
        }
        lines.append(row(["Счёт по сетам", "\(board.setsWonByUs):\(board.setsWonByThem)"]))
        lines.append(row(["Сеты"] + board.sets.map { "\($0.us):\($0.them)" }))
        lines.append("")

        var header = ["№", "Игрок"]
        for category in categories {
            header += category.columns.map { "\(category.title) \($0.title)" }
        }
        lines.append(row(header))

        for statsRow in table.players + [table.team] {
            var cells = [statsRow.number.map(String.init) ?? "", statsRow.name]
            for category in categories {
                cells += category.columns.map { $0.value(statsRow.line) }
            }
            lines.append(row(cells))
        }
        return lines.joined(separator: "\n")
    }

    private static func row(_ cells: [String]) -> String {
        cells.map(escape).joined(separator: ";")
    }

    private static func escape(_ cell: String) -> String {
        guard cell.contains(where: { $0 == ";" || $0 == "\"" || $0 == "\n" }) else { return cell }
        return "\"" + cell.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .commaSeparatedText) { export in
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(export.fileName)
            // The byte order mark makes Excel read the file as UTF-8 instead of a legacy code page.
            let data = Data("\u{FEFF}".utf8) + Data(export.text.utf8)
            try data.write(to: url, options: .atomic)
            return SentTransferredFile(url)
        }
    }
}
