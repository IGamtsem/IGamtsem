import SwiftData
import SwiftUI

struct MatchesListView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Match.date, order: .reverse) private var matches: [Match]
    @State private var isCreating = false
    @State private var createdMatch: Match?
    @State private var liveMatch: Match?

    private var inProgress: [Match] { matches.filter { !$0.isFinished } }
    private var finished: [Match] { matches.filter(\.isFinished) }

    var body: some View {
        NavigationStack {
            List {
                if !inProgress.isEmpty {
                    Section("Идут") {
                        ForEach(inProgress) { MatchLink(match: $0) }
                            .onDelete { delete(inProgress, at: $0) }
                    }
                }
                if !finished.isEmpty {
                    Section("Завершены") {
                        ForEach(finished) { MatchLink(match: $0) }
                            .onDelete { delete(finished, at: $0) }
                    }
                }
            }
            .overlay {
                if matches.isEmpty {
                    ContentUnavailableView {
                        Label("Нет матчей", systemImage: "sportscourt")
                    } description: {
                        Text("Начните матч, чтобы записывать подачи, приём, атаки и блоки по ходу игры.")
                    } actions: {
                        Button("Новый матч") { isCreating = true }
                            .buttonStyle(.borderedProminent)
                    }
                }
            }
            .navigationTitle("Матчи")
            .navigationDestination(for: Match.self) { MatchDetailView(match: $0) }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Новый матч", systemImage: "plus") { isCreating = true }
                }
            }
            .sheet(isPresented: $isCreating, onDismiss: {
                liveMatch = createdMatch
                createdMatch = nil
            }) {
                NewMatchView { createdMatch = $0 }
            }
            .fullScreenCover(item: $liveMatch) { LiveMatchView(match: $0) }
        }
    }

    private func delete(_ list: [Match], at offsets: IndexSet) {
        for index in offsets { context.delete(list[index]) }
    }
}

private struct MatchLink: View {
    let match: Match

    var body: some View {
        NavigationLink(value: match) {
            MatchRow(match: match)
        }
    }
}

struct MatchRow: View {
    let match: Match

    var body: some View {
        let board = match.scoreboard
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("\(match.displayTeamName) — \(match.opponent)")
                    .font(.headline)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                Text("\(board.setsWonByUs):\(board.setsWonByThem)")
                    .font(.title3.monospacedDigit().bold())
                if !match.isFinished {
                    Text("Сет \(match.currentSet) · \(board.current.us):\(board.current.them)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.orange)
                }
            }
        }
    }

    private var subtitle: String {
        let date = match.date.formatted(date: .abbreviated, time: .omitted)
        return match.tournament.isEmpty ? date : "\(date) · \(match.tournament)"
    }
}
