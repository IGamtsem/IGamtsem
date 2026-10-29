import SwiftData
import SwiftUI

struct MatchDetailView: View {
    @Environment(\.modelContext) private var context
    @Bindable var match: Match
    @State private var isLive = false

    var body: some View {
        let board = match.scoreboard
        List {
            Section {
                ScoreSummary(match: match, board: board)
                if match.isFinished {
                    Button("Возобновить запись", systemImage: "arrow.uturn.backward") {
                        match.reopen()
                        isLive = true
                    }
                } else {
                    Button("Продолжить запись", systemImage: "record.circle") { isLive = true }
                        .font(.headline)
                }
            }

            Section {
                NavigationLink {
                    StatsView(match: match)
                } label: {
                    Label("Статистика игроков", systemImage: "tablecells")
                }
                ShareLink(item: CSVExport(match: match), preview: SharePreview(CSVExport.fileName(for: match))) {
                    Label("Экспорт в CSV", systemImage: "square.and.arrow.up")
                }
            }

            ForEach(Array(board.sets.reversed())) { set in
                let events = Array(match.orderedEvents.filter { $0.setNumber == set.number }.reversed())
                if !events.isEmpty {
                    Section("Сет \(set.number) · \(set.us):\(set.them)") {
                        ForEach(events) { EventRow(event: $0) }
                            .onDelete { offsets in
                                for index in offsets { context.delete(events[index]) }
                            }
                    }
                }
            }
        }
        .navigationTitle("\(match.displayTeamName) — \(match.opponent)")
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(isPresented: $isLive) { LiveMatchView(match: match) }
    }
}

private struct ScoreSummary: View {
    let match: Match
    let board: Scoreboard

    var body: some View {
        VStack(spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(match.displayTeamName)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("\(board.setsWonByUs) : \(board.setsWonByThem)")
                    .font(.largeTitle.monospacedDigit().bold())
                Text(match.opponent)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .font(.headline)
            .lineLimit(2)
            Text(board.sets.map { "\($0.us):\($0.them)" }.joined(separator: "  "))
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)
            Text(match.date.formatted(date: .long, time: .shortened))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}

struct EventRow: View {
    let event: StatEvent

    var body: some View {
        HStack {
            Text(event.summary)
                .font(.subheadline)
            Spacer()
            switch event.play.pointWinner {
            case .us:
                Image(systemName: "plus.circle.fill").foregroundStyle(.green)
            case .them:
                Image(systemName: "minus.circle.fill").foregroundStyle(.red)
            case nil:
                EmptyView()
            }
        }
    }
}
