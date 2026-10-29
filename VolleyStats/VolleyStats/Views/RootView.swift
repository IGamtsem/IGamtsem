import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            MatchesListView()
                .tabItem { Label("Матчи", systemImage: "sportscourt") }
            TeamsListView()
                .tabItem { Label("Команды", systemImage: "person.3") }
        }
    }
}
