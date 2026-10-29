import SwiftData
import SwiftUI

struct NewMatchView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Team.name) private var teams: [Team]

    var onCreate: (Match) -> Void

    @State private var team: Team?
    @State private var opponent = ""
    @State private var tournament = ""
    @State private var date = Date.now
    @State private var rules = MatchRules()

    private var trimmedOpponent: String { opponent.trimmingCharacters(in: .whitespaces) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if teams.isEmpty {
                        Button("Создать демо-команду") { team = Team.makeDemo(in: context) }
                        Text("Свою команду можно добавить на вкладке «Команды».")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        Picker("Моя команда", selection: $team) {
                            ForEach(teams) { Text($0.name).tag(Optional($0)) }
                        }
                    }
                    TextField("Соперник", text: $opponent)
                    TextField("Турнир (необязательно)", text: $tournament)
                    DatePicker("Дата", selection: $date)
                }
                Section("Формат") {
                    Picker("Матч", selection: $rules.bestOf) {
                        Text("До 2 побед (3 сета)").tag(3)
                        Text("До 3 побед (5 сетов)").tag(5)
                    }
                    Stepper("Очков в сете: \(rules.pointsPerSet)", value: $rules.pointsPerSet, in: 5...50)
                    Stepper("В решающем сете: \(rules.decidingSetPoints)", value: $rules.decidingSetPoints, in: 5...50)
                }
            }
            .navigationTitle("Новый матч")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Начать") { create() }
                        .disabled(team == nil || trimmedOpponent.isEmpty)
                }
            }
            .onAppear {
                if team == nil { team = teams.first }
            }
        }
    }

    private func create() {
        guard let team else { return }
        let match = Match(
            teamName: team.name,
            opponent: trimmedOpponent,
            tournament: tournament.trimmingCharacters(in: .whitespaces),
            date: date,
            rules: rules
        )
        context.insert(match)
        match.team = team
        onCreate(match)
        dismiss()
    }
}
