import SwiftData
import SwiftUI

@main
struct VolleyStatsApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(for: [Team.self, Player.self, Match.self, StatEvent.self])
    }
}
