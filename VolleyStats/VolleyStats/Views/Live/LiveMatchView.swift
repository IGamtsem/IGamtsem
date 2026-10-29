import SwiftData
import SwiftUI

/// Courtside input: pick a player, then tap the skill and its outcome. Two taps per action.
struct LiveMatchView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    let match: Match

    @State private var selectedPlayer: Player?
    @State private var setEndWinner: Side?

    private var roster: [Player] { match.team?.roster ?? [] }

    private var title: String {
        match.isFinished ? "Матч завершён" : "Сет \(match.currentSet)"
    }

    var body: some View {
        let board = match.scoreboard
        NavigationStack {
            VStack(spacing: 0) {
                LiveScoreboard(match: match, board: board)
                Divider()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        if match.isFinished {
                            finishedBanner(board)
                        } else {
                            playerGrid
                            actionPad
                            teamActions
                        }
                        recentEvents
                    }
                    .padding()
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть") { dismiss() }
                }
                ToolbarItemGroup(placement: .primaryAction) {
                    Button("Отменить", systemImage: "arrow.uturn.backward") {
                        selectedPlayer = nil
                        match.undoLast(in: context)
                    }
                    .disabled(match.events.isEmpty)
                    Menu("Ещё", systemImage: "ellipsis.circle") {
                        Button("Завершить сет", systemImage: "flag.checkered") {
                            let current = board.current
                            setEndWinner = current.us > current.them ? .us : .them
                        }
                        .disabled(match.isFinished || board.current.us == board.current.them)
                    }
                }
            }
            .alert(
                "Сет \(board.currentSet) — \(board.current.us):\(board.current.them)",
                isPresented: Binding(
                    get: { setEndWinner != nil },
                    set: { if !$0 { setEndWinner = nil } }
                ),
                presenting: setEndWinner
            ) { winner in
                let label = board.closingSetEndsMatch(winner: winner) ? "Завершить матч" : "Завершить сет"
                Button(label) {
                    match.closeCurrentSet()
                }
                Button("Продолжить сет", role: .cancel) {}
            } message: { winner in
                let text = winner == .us ? "Сет за \(match.displayTeamName)." : "Сет за соперником (\(match.opponent))."
                Text(text)
            }
            .sensoryFeedback(.impact(weight: .medium), trigger: match.events.count)
        }
    }

    // MARK: - Sections

    @ViewBuilder
    private var playerGrid: some View {
        if roster.isEmpty {
            Text("В составе нет игроков. Добавьте их на вкладке «Команды», а пока можно вести счёт кнопками ниже.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        } else {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 68), spacing: 8)], spacing: 8) {
                ForEach(roster) { player in
                    PlayerButton(player: player, isSelected: selectedPlayer?.uid == player.uid) {
                        selectedPlayer = selectedPlayer?.uid == player.uid ? nil : player
                    }
                }
            }
        }
    }

    private var actionPad: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(selectedPlayer.map { "#\($0.number) \($0.name)" } ?? "Выберите игрока")
                .font(.headline)
                .foregroundStyle(selectedPlayer == nil ? Color.secondary : Color.primary)
            ForEach(Skill.playerSkills) { skill in
                HStack(spacing: 6) {
                    Text(skill.title)
                        .font(.subheadline.weight(.medium))
                        .frame(width: 66, alignment: .leading)
                    ForEach(skill.outcomes, id: \.self) { outcome in
                        OutcomeButton(skill: skill, outcome: outcome) { record(skill, outcome) }
                    }
                }
            }
            .disabled(selectedPlayer == nil)
        }
    }

    private var teamActions: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Без игрока")
                .font(.headline)
            HStack(spacing: 6) {
                ForEach(Skill.teamSkills) { skill in
                    OutcomeButton(skill: skill, outcome: .neutral) { record(skill, .neutral) }
                }
            }
        }
    }

    @ViewBuilder
    private var recentEvents: some View {
        let recent = match.orderedEvents.suffix(6).reversed()
        if !recent.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Последние действия")
                    .font(.headline)
                ForEach(Array(recent)) { event in
                    EventRow(event: event)
                    Divider()
                }
            }
        }
    }

    private func finishedBanner(_ board: Scoreboard) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "trophy.fill")
                .font(.largeTitle)
                .foregroundStyle(board.setsWonByUs > board.setsWonByThem ? Color.yellow : Color.secondary)
            Text(board.setsWonByUs > board.setsWonByThem ? "Победа" : "Поражение")
                .font(.title2.bold())
            Text("Отменить последнее действие можно кнопкой ↶ — это вернёт матч в игру.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical)
    }

    // MARK: - Actions

    private func record(_ skill: Skill, _ outcome: Outcome) {
        guard !match.isFinished else { return }
        match.record(skill, outcome, by: skill.isTeamEvent ? nil : selectedPlayer, in: context)
        selectedPlayer = nil
        if let winner = match.scoreboard.currentSetWinnerByRules {
            setEndWinner = winner
        }
    }
}

// MARK: - Components

private struct LiveScoreboard: View {
    let match: Match
    let board: Scoreboard

    var body: some View {
        VStack(spacing: 6) {
            HStack(alignment: .center) {
                TeamScore(name: match.displayTeamName, sets: board.setsWonByUs, alignment: .leading)
                Text("\(board.current.us) : \(board.current.them)")
                    .font(.system(size: 44, weight: .bold, design: .rounded).monospacedDigit())
                    .contentTransition(.numericText())
                    .animation(.snappy, value: board.current)
                TeamScore(name: match.opponent, sets: board.setsWonByThem, alignment: .trailing)
            }
            if board.sets.count > 1 {
                Text(board.sets.dropLast().map { "\($0.us):\($0.them)" }.joined(separator: "   "))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .background(.bar)
    }
}

private struct TeamScore: View {
    let name: String
    let sets: Int
    let alignment: HorizontalAlignment

    var body: some View {
        VStack(alignment: alignment, spacing: 2) {
            Text(name)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
            Text("Сеты: \(sets)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: Alignment(horizontal: alignment, vertical: .center))
    }
}

private struct PlayerButton: View {
    let player: Player
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text("\(player.number)")
                    .font(.title2.bold().monospacedDigit())
                Text(player.name)
                    .font(.caption2)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, minHeight: 56)
            .padding(.horizontal, 4)
            .foregroundStyle(isSelected ? Color.white : Color.primary)
            .background(
                isSelected ? Color.accentColor : Color(.secondarySystemBackground),
                in: RoundedRectangle(cornerRadius: 10)
            )
            .overlay {
                if player.position == .libero {
                    RoundedRectangle(cornerRadius: 10).strokeBorder(.orange, lineWidth: 2)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

private struct OutcomeButton: View {
    let skill: Skill
    let outcome: Outcome
    let action: () -> Void

    private var color: Color {
        switch Play(setNumber: 0, playerID: nil, skill: skill, outcome: outcome).pointWinner {
        case .us: .green
        case .them: .red
        case nil: .blue
        }
    }

    private var label: String {
        skill.isTeamEvent ? skill.title : outcome.title(for: skill)
    }

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.footnote.weight(.semibold))
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, minHeight: 40)
        }
        .buttonStyle(.borderedProminent)
        .tint(color)
    }
}
