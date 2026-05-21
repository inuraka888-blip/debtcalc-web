import Foundation

typealias UserID = UUID

struct User: Identifiable, Codable, Hashable {
    let id: UUID
    var name: String
}

struct Group: Identifiable, Codable, Hashable {
    let id: UUID
    var name: String
    var users: [User]
    var participantGroups: [ParticipantGroup]
    var expenses: [Expense]
}

struct ParticipantGroup: Identifiable, Codable, Hashable {
    let id: UUID
    var name: String
    var userIds: [UUID]
}

enum ExpenseSplitMode: String, Codable, Hashable {
    case equal
    case custom
}

struct Expense: Identifiable, Codable, Hashable {
    let id: UUID
    var title: String
    var amount: Decimal
    var splitMode: ExpenseSplitMode
    var paidBySplits: [ExpenseSplit]
    var splits: [ExpenseSplit]
    var date: Date
    var categoryId: UUID?
    var note: String?
}

struct ExpenseSplit: Codable, Hashable {
    var userId: UUID
    var amount: Decimal
}

struct Debt: Identifiable, Equatable {
    let from: UUID
    let to: UUID
    let amount: Decimal

    var id: String {
        "\(from.uuidString)-\(to.uuidString)-\(amount.description)"
    }
}

extension Group {
    static var sample: Group {
        let alice = User(id: UUID(), name: "Alice")
        let bob = User(id: UUID(), name: "Bob")
        let clara = User(id: UUID(), name: "Clara")
        let daniel = User(id: UUID(), name: "Daniel")
        
        let friends = ParticipantGroup(
            id: UUID(),
            name: "Friends",
            userIds: [alice.id, bob.id, clara.id]
        )

        let dinner = Expense(
            id: UUID(),
            title: "Dinner",
            amount: Decimal(90),
            splitMode: .equal,
            paidBySplits: [
                ExpenseSplit(userId: alice.id, amount: Decimal(90))
            ],
            splits: [
                ExpenseSplit(userId: alice.id, amount: Decimal(30)),
                ExpenseSplit(userId: bob.id, amount: Decimal(30)),
                ExpenseSplit(userId: clara.id, amount: Decimal(30))
            ],
            date: Date(),
            categoryId: nil,
            note: nil
        )

        return Group(
            id: UUID(),
            name: "Trip to Kazan",
            users: [alice, bob, clara, daniel],
            participantGroups: [friends],
            expenses: [dinner]
        )
    }
}
