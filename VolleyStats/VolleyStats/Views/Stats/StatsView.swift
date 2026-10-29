import SwiftUI

struct StatsView: View {
    let match: Match
    @State private var category = StatCategory.summary
    /// 0 means the whole match.
    @State private var setNumber = 0

    var body: some View {
        let table = match.statsTable(setNumber: setNumber == 0 ? nil : setNumber)
        let columns = category.columns
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(StatCategory.allCases) { item in
                            Button(item.title) { category = item }
                                .buttonStyle(.bordered)
                                .tint(item == category ? Color.accentColor : Color.secondary)
                        }
                    }
                }

                Picker("Сет", selection: $setNumber) {
                    Text("Матч").tag(0)
                    ForEach(1...max(match.currentSet, 1), id: \.self) { Text("Сет \($0)").tag($0) }
                }
                .pickerStyle(.segmented)

                if table.players.isEmpty {
                    ContentUnavailableView("Нет данных", systemImage: "tablecells", description: Text("В этом отрезке ещё ничего не записано."))
                } else {
                    ScrollView(.horizontal) {
                        StatsGrid(table: table, columns: columns)
                            .padding(.bottom, 4)
                    }
                }

                Text(legend)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
        .navigationTitle("Статистика")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var legend: String {
        switch category {
        case .summary: "Очки — эйсы, атаки и блоки, принёсшие очко. Ош — все ошибки, включая заблокированные атаки."
        case .attack: "Рез% — доля атак, принёсших очко. Эфф% = (очки − ошибки − блоки соперника) / всего атак."
        case .serve: "Слож — подача, после которой соперник не смог нормально принять."
        case .reception: "# идеально, + хорошо, − плохо. Пол% — доля идеальных и хороших, Отл% — только идеальных."
        case .block: "Кас — касание блока, после которого мяч остался в игре."
        case .defense: "Защ — все записанные защиты. Пас — передачи, учтённые вручную."
        }
    }
}

private struct StatsGrid: View {
    let table: StatsTable
    let columns: [StatColumn]

    var body: some View {
        Grid(alignment: .trailing, horizontalSpacing: 14, verticalSpacing: 10) {
            GridRow {
                Text("Игрок").gridColumnAlignment(.leading)
                ForEach(columns) { Text($0.title) }
            }
            .font(.caption.bold())
            .foregroundStyle(.secondary)

            Divider()

            ForEach(table.players) { row in
                GridRow {
                    PlayerCell(row: row)
                    ForEach(columns) { Text($0.value(row.line)) }
                }
                .font(.body.monospacedDigit())
            }

            Divider()

            GridRow {
                Text(table.team.name)
                ForEach(columns) { Text($0.value(table.team.line)) }
            }
            .font(.body.monospacedDigit().bold())
        }
    }
}

private struct PlayerCell: View {
    let row: StatsRow

    var body: some View {
        HStack(spacing: 6) {
            Text(row.number.map { "\($0)" } ?? "–")
                .bold()
                .frame(minWidth: 24, alignment: .trailing)
            Text(row.name)
                .lineLimit(1)
        }
    }
}
