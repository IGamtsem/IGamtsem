import SwiftData
import SwiftUI

struct TeamDetailView: View {
    @Environment(\.modelContext) private var context
    @Bindable var team: Team
    @State private var editorTarget: PlayerEditorTarget?

    var body: some View {
        Form {
            Section("Название") {
                TextField("Название команды", text: $team.name)
            }
            Section {
                ForEach(team.roster) { player in
                    Button {
                        editorTarget = .edit(player)
                    } label: {
                        PlayerRow(player: player)
                    }
                    .tint(Color.primary)
                }
                .onDelete { offsets in
                    let roster = team.roster
                    for index in offsets { context.delete(roster[index]) }
                }
                Button("Добавить игрока", systemImage: "plus") { editorTarget = .new }
            } header: {
                Text("Состав")
            } footer: {
                Text("Удалённый игрок остаётся в статистике уже сыгранных матчей.")
            }
        }
        .navigationTitle(team.name)
        .sheet(item: $editorTarget) { target in
            PlayerEditorView(team: team, player: target.player)
        }
    }
}

struct PlayerRow: View {
    let player: Player

    var body: some View {
        HStack(spacing: 12) {
            Text("\(player.number)")
                .font(.title3.monospacedDigit().bold())
                .frame(width: 40)
            Text(player.name)
            Spacer()
            Text(player.position.title)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}

enum PlayerEditorTarget: Identifiable {
    case new
    case edit(Player)

    var id: String {
        switch self {
        case .new: "new"
        case .edit(let player): player.uid.uuidString
        }
    }

    var player: Player? {
        if case .edit(let player) = self { return player }
        return nil
    }
}

struct PlayerEditorView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    let team: Team
    let player: Player?

    @State private var name = ""
    @State private var number = 0
    @State private var position = Position.outside

    private var trimmedName: String { name.trimmingCharacters(in: .whitespaces) }

    private var numberTaken: Bool {
        team.players.contains { $0.number == number && $0.uid != player?.uid }
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Фамилия и имя", text: $name)
                    .textInputAutocapitalization(.words)
                TextField("Номер", value: $number, format: .number)
                    .keyboardType(.numberPad)
                Picker("Амплуа", selection: $position) {
                    ForEach(Position.allCases) { Text($0.title).tag($0) }
                }
                if numberTaken {
                    Text("Номер \(number) уже есть в составе")
                        .foregroundStyle(.orange)
                }
            }
            .navigationTitle(player == nil ? "Новый игрок" : "Игрок")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Готово") { save() }
                        .disabled(trimmedName.isEmpty)
                }
            }
            .onAppear {
                if let player {
                    name = player.name
                    number = player.number
                    position = player.position
                } else {
                    number = (team.players.map(\.number).max() ?? 0) + 1
                }
            }
        }
    }

    private func save() {
        if let player {
            player.name = trimmedName
            player.number = number
            player.position = position
        } else {
            let newPlayer = Player(name: trimmedName, number: number, position: position)
            context.insert(newPlayer)
            newPlayer.team = team
        }
        dismiss()
    }
}
