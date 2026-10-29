import SwiftData
import SwiftUI

struct TeamsListView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Team.name) private var teams: [Team]
    @State private var isAddingTeam = false
    @State private var newTeamName = ""

    var body: some View {
        NavigationStack {
            List {
                ForEach(teams) { team in
                    NavigationLink(value: team) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(team.name).font(.headline)
                            Text("Игроков: \(team.players.count)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete { offsets in
                    for index in offsets { context.delete(teams[index]) }
                }
            }
            .overlay {
                if teams.isEmpty {
                    ContentUnavailableView {
                        Label("Нет команд", systemImage: "person.3")
                    } description: {
                        Text("Создайте команду и добавьте игроков, чтобы вести статистику.")
                    } actions: {
                        Button("Создать команду") { isAddingTeam = true }
                            .buttonStyle(.borderedProminent)
                        Button("Демо-команда") { _ = Team.makeDemo(in: context) }
                    }
                }
            }
            .navigationTitle("Команды")
            .navigationDestination(for: Team.self) { TeamDetailView(team: $0) }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Добавить", systemImage: "plus") { isAddingTeam = true }
                }
            }
            .alert("Новая команда", isPresented: $isAddingTeam) {
                TextField("Название", text: $newTeamName)
                Button("Отмена", role: .cancel) { newTeamName = "" }
                Button("Создать") {
                    let name = newTeamName.trimmingCharacters(in: .whitespaces)
                    if !name.isEmpty { context.insert(Team(name: name)) }
                    newTeamName = ""
                }
            }
        }
    }
}
