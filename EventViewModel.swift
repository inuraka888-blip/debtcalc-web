import Foundation
import SwiftUI
import Combine

enum ExpensePresentationError: Hashable {
    case expenseNotFound
    case titleEmpty
    case amountInvalidPositive
    case payerRequired
    case payerOutsideGroup
    case paidAmountsNegative
    case paidByMismatch
    case participantRequired
    case splitsOutsideGroup
    case splitAmountsNegative
    case splitMismatch
    case payerMustBeParticipant
    case invalidPayer
    case invalidParticipant
    case negativeSplit
    case paidByMismatchForExpense(String)
    case splitMismatchForExpense(String)
    case nonZeroResidual
    case unknown

    var localizedResource: LocalizedStringResource {
        switch self {
        case .expenseNotFound:
            return L10n.Errors.expenseNotFound
        case .titleEmpty:
            return L10n.Errors.titleEmpty
        case .amountInvalidPositive:
            return L10n.Errors.amountInvalidPositive
        case .payerRequired:
            return L10n.Errors.payerRequired
        case .payerOutsideGroup:
            return L10n.Errors.payerOutsideGroup
        case .paidAmountsNegative:
            return L10n.Errors.paidAmountsNegative
        case .paidByMismatch:
            return L10n.Errors.paidByMismatch
        case .participantRequired:
            return L10n.Errors.participantRequired
        case .splitsOutsideGroup:
            return L10n.Errors.splitsOutsideGroup
        case .splitAmountsNegative:
            return L10n.Errors.splitAmountsNegative
        case .splitMismatch:
            return L10n.Errors.splitMismatch
        case .payerMustBeParticipant:
            return L10n.Errors.payerMustBeParticipant
        case .invalidPayer:
            return L10n.Errors.invalidPayer
        case .invalidParticipant:
            return L10n.Errors.invalidParticipant
        case .negativeSplit:
            return L10n.Errors.negativeSplit
        case .paidByMismatchForExpense(let title):
            return LocalizedStringResource(stringLiteral: L10n.Errors.paidByMismatchForExpense(title))
        case .splitMismatchForExpense(let title):
            return LocalizedStringResource(stringLiteral: L10n.Errors.splitMismatchForExpense(title))
        case .nonZeroResidual:
            return L10n.Errors.nonZeroResidual
        case .unknown:
            return L10n.Common.unknownError
        }
    }
}

enum ParticipantsPresentationError: Hashable {
    case participantNameEmpty
    case participantAlreadyExists
    case participantGroupNotFound
    case participantNotFound
    case participantInUse
    case participantGroupNameEmpty
    case invalidParticipantGroupMembers
    case participantGroupOverlap
    case groupAlreadyExists

    var localizedResource: LocalizedStringResource {
        switch self {
        case .participantNameEmpty:
            return L10n.Errors.participantNameEmpty
        case .participantAlreadyExists:
            return L10n.Errors.participantAlreadyExists
        case .participantGroupNotFound:
            return L10n.Errors.participantGroupNotFound
        case .participantNotFound:
            return L10n.Errors.participantNotFound
        case .participantInUse:
            return L10n.Errors.participantInUse
        case .participantGroupNameEmpty:
            return L10n.Errors.participantGroupNameEmpty
        case .invalidParticipantGroupMembers:
            return L10n.Errors.invalidParticipantGroupMembers
        case .participantGroupOverlap:
            return L10n.Errors.participantGroupOverlap
        case .groupAlreadyExists:
            return L10n.Errors.groupAlreadyExists
        }
    }
}

enum AggregateParticipant: Hashable {
    case user(UUID)
    case group(UUID)
}

struct AggregatedDebt: Identifiable {
    let from: AggregateParticipant
    let to: AggregateParticipant
    let amount: Decimal

    var id: String {
        "\(String(describing: from))-\(String(describing: to))-\(amount)"
    }
}

@MainActor
final class EventViewModel: ObservableObject {
    @Published private(set) var group: Group
    @Published private(set) var balances: [UUID: Decimal] = [:]
    @Published private(set) var debts: [Debt] = []
    @Published var addExpenseError: ExpensePresentationError?
    @Published var participantsError: ParticipantsPresentationError?

    init(group: Group) {
        self.group = group
        recalculate()
    }

    func replaceGroup(with group: Group) {
        self.group = group
        recalculate()
    }

    func updateGroupName(_ newName: String) -> Bool {
        let trimmedName = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            return false
        }

        group.name = trimmedName
        recalculate()
        return true
    }

    func clearParticipantsError() {
        participantsError = nil
    }

    func recalculate() {
        do {
            balances = try BalanceCalculator.calculateBalances(for: group)
            debts = try BalanceCalculator.calculateDebts(for: group)
            addExpenseError = nil
        } catch {
            addExpenseError = mapExpenseError(error)
            balances = [:]
            debts = []
        }
    }

    func addExpense(
        title: String,
        amount: Decimal,
        splitMode: ExpenseSplitMode,
        paidBySplits: [UUID: Decimal],
        splits: [UUID: Decimal],
        categoryId: UUID?,
        date: Date,
        note: String?
    ) -> Bool {
        let expense = validatedExpense(
            id: UUID(),
            title: title,
            amount: amount,
            splitMode: splitMode,
            paidBySplits: paidBySplits,
            splits: splits,
            date: date,
            categoryId: categoryId,
            note: note
        )
        
        guard let expense else {
            return false
        }

        group.expenses.append(expense)
        recalculate()
        return addExpenseError == nil
    }
    
    func updateExpense(
        id: UUID,
        title: String,
        amount: Decimal,
        splitMode: ExpenseSplitMode,
        paidBySplits: [UUID: Decimal],
        splits: [UUID: Decimal],
        categoryId: UUID?,
        date: Date,
        note: String?
    ) -> Bool {
        guard let index = group.expenses.firstIndex(where: { $0.id == id }) else {
            addExpenseError = .expenseNotFound
            return false
        }
        
        let existingExpense = group.expenses[index]
        let expense = validatedExpense(
            id: existingExpense.id,
            title: title,
            amount: amount,
            splitMode: splitMode,
            paidBySplits: paidBySplits,
            splits: splits,
            date: date,
            categoryId: categoryId,
            note: note
        )
        
        guard let expense else {
            return false
        }

        group.expenses[index] = expense
        recalculate()
        return addExpenseError == nil
    }

    func removeExpense(id: UUID) -> Bool {
        guard let index = group.expenses.firstIndex(where: { $0.id == id }) else {
            addExpenseError = .expenseNotFound
            return false
        }

        group.expenses.remove(at: index)
        recalculate()
        return addExpenseError == nil
    }

    func addUser(name: String) -> Bool {
        let normalizedName = name.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !normalizedName.isEmpty else {
            participantsError = .participantNameEmpty
            return false
        }

        let duplicateExists = group.users.contains {
            $0.name.trimmingCharacters(in: .whitespacesAndNewlines)
                .caseInsensitiveCompare(normalizedName) == .orderedSame
        }

        guard !duplicateExists else {
            participantsError = .participantAlreadyExists
            return false
        }

        participantsError = nil
        group.users.append(User(id: UUID(), name: normalizedName))
        recalculate()
        return true
    }

    func addUser(name: String, toGroupId: UUID) -> Bool {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            participantsError = .participantNameEmpty
            return false
        }

        guard validateUniqueUserName(trimmedName, excludingUserID: nil) else {
            return false
        }

        guard let groupIndex = group.participantGroups.firstIndex(where: { $0.id == toGroupId }) else {
            participantsError = .participantGroupNotFound
            return false
        }

        let user = User(id: UUID(), name: trimmedName)
        group.users.append(user)

        var userIDs = group.participantGroups[groupIndex].userIds
        userIDs.append(user.id)
        group.participantGroups[groupIndex].userIds = normalizedOrderedUserIDs(userIDs)
        participantsError = nil
        recalculate()
        return true
    }

    func updateUser(id: UUID, newName: String) -> Bool {
        let trimmedName = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            participantsError = .participantNameEmpty
            return false
        }

        guard validateUniqueUserName(trimmedName, excludingUserID: id) else {
            return false
        }

        guard let index = group.users.firstIndex(where: { $0.id == id }) else {
            participantsError = .participantNotFound
            return false
        }

        group.users[index].name = trimmedName
        participantsError = nil
        recalculate()
        return true
    }

    func removeUser(id: UUID) -> Bool {
        let isUsedInExpenses = group.expenses.contains { expense in
            expense.paidBySplits.contains(where: { $0.userId == id }) || expense.splits.contains(where: { $0.userId == id })
        }

        guard !isUsedInExpenses else {
            participantsError = .participantInUse
            return false
        }

        group.users.removeAll { $0.id == id }
        group.participantGroups = group.participantGroups.map { participantGroup in
            var updatedGroup = participantGroup
            updatedGroup.userIds.removeAll { $0 == id }
            return updatedGroup
        }
        participantsError = nil
        recalculate()
        return true
    }

    func addParticipantGroup(name: String) -> Bool {
        addParticipantGroup(name: name, userIds: [])
    }

    func addParticipantGroup(name: String, userIds: [UUID]) -> Bool {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            participantsError = .participantGroupNameEmpty
            return false
        }

        guard validateUniqueParticipantGroupName(trimmedName, excludingGroupID: nil) else {
            return false
        }

        let normalizedUserIDs = Array(Set(userIds)).sorted { $0.uuidString < $1.uuidString }

        guard validateParticipantGroupMembers(userIds: normalizedUserIDs, excludingGroupID: nil) else {
            return false
        }

        group.participantGroups.append(
            ParticipantGroup(id: UUID(), name: trimmedName, userIds: normalizedUserIDs)
        )
        participantsError = nil
        recalculate()
        return true
    }

    func updateParticipantGroup(id: UUID, name: String, userIds: [UUID]) -> Bool {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            participantsError = .participantGroupNameEmpty
            return false
        }

        guard validateUniqueParticipantGroupName(trimmedName, excludingGroupID: id) else {
            return false
        }

        let normalizedUserIDs = Array(Set(userIds)).sorted { $0.uuidString < $1.uuidString }

        guard let index = group.participantGroups.firstIndex(where: { $0.id == id }) else {
            participantsError = .participantGroupNotFound
            return false
        }

        guard validateParticipantGroupMembers(userIds: normalizedUserIDs, excludingGroupID: id) else {
            return false
        }

        group.participantGroups[index].name = trimmedName
        group.participantGroups[index].userIds = normalizedUserIDs
        participantsError = nil
        recalculate()
        return true
    }

    func updateParticipantGroupName(id: UUID, newName: String) -> Bool {
        guard let participantGroup = group.participantGroups.first(where: { $0.id == id }) else {
            participantsError = .participantGroupNotFound
            return false
        }

        return updateParticipantGroup(id: id, name: newName, userIds: participantGroup.userIds)
    }

    func removeParticipantGroup(id: UUID) -> Bool {
        group.participantGroups.removeAll { $0.id == id }
        participantsError = nil
        recalculate()
        return true
    }

    func createEmptyParticipantGroup() -> Bool {
        let existingNames = Set(group.participantGroups.map(\.name))
        var index = group.participantGroups.count + 1
        var candidate = L10n.Participants.autoGroupName(index)

        while existingNames.contains(candidate) {
            index += 1
            candidate = L10n.Participants.autoGroupName(index)
        }

        group.participantGroups.append(
            ParticipantGroup(id: UUID(), name: candidate, userIds: [])
        )
        recalculate()
        return true
    }

    func moveUserToIndividuals(userId: UUID) -> Bool {
        moveUserToIndividuals(userId: userId, at: nil)
    }

    func moveUserToIndividuals(userId: UUID, at index: Int?) -> Bool {
        guard group.users.contains(where: { $0.id == userId }) else {
            participantsError = .participantNotFound
            return false
        }

        let previousStandaloneIDs = standaloneUsers().map(\.id)
        let currentStandaloneIndex = previousStandaloneIDs.firstIndex(of: userId)

        removeUserFromAllParticipantGroups(userId)

        var reorderedStandaloneIDs = standaloneUsers().map(\.id)
        guard let insertedIndex = reorderedStandaloneIDs.firstIndex(of: userId) else {
            participantsError = .participantNotFound
            return false
        }

        if let index {
            let boundedIndex = max(0, min(index, reorderedStandaloneIDs.count))
            reorderedStandaloneIDs.move(
                fromOffsets: IndexSet(integer: insertedIndex),
                toOffset: adjustedOffset(
                    sourceIndex: insertedIndex,
                    destinationIndex: boundedIndex,
                    count: reorderedStandaloneIDs.count
                )
            )
        } else if currentStandaloneIndex == nil {
            reorderedStandaloneIDs.move(
                fromOffsets: IndexSet(integer: insertedIndex),
                toOffset: reorderedStandaloneIDs.count
            )
        }

        applyStandaloneOrder(reorderedStandaloneIDs)
        participantsError = nil
        recalculate()
        return true
    }

    func moveUser(userId: UUID, toGroupId: UUID, at index: Int?) -> Bool {
        guard group.users.contains(where: { $0.id == userId }) else {
            participantsError = .participantNotFound
            return false
        }

        guard let targetGroupIndex = group.participantGroups.firstIndex(where: { $0.id == toGroupId }) else {
            participantsError = .participantGroupNotFound
            return false
        }

        let sourceGroupID = participantGroupID(for: userId)
        let sourceIndex = sourceGroupID.flatMap { participantGroupID in
            group.participantGroups.first(where: { $0.id == participantGroupID })?.userIds.firstIndex(of: userId)
        }

        removeUserFromAllParticipantGroups(userId)

        var targetUserIDs = group.participantGroups[targetGroupIndex].userIds
        let destinationIndex = max(0, min(index ?? targetUserIDs.count, targetUserIDs.count))
        let insertionIndex: Int
        if sourceGroupID == toGroupId, let sourceIndex, sourceIndex < destinationIndex {
            insertionIndex = max(0, destinationIndex - 1)
        } else {
            insertionIndex = destinationIndex
        }

        targetUserIDs.insert(userId, at: insertionIndex)
        group.participantGroups[targetGroupIndex].userIds = normalizedOrderedUserIDs(targetUserIDs)
        participantsError = nil
        recalculate()
        return true
    }

    func moveUser(userId: UUID, toGroupId: UUID) -> Bool {
        moveUser(userId: userId, toGroupId: toGroupId, at: nil)
    }

    func reorderIndividualUsers(fromOffsets: IndexSet, toOffset: Int) -> Bool {
        var standaloneIDs = standaloneUsers().map(\.id)
        standaloneIDs.move(fromOffsets: fromOffsets, toOffset: toOffset)
        applyStandaloneOrder(standaloneIDs)
        recalculate()
        return true
    }

    func reorderUsersInParticipantGroup(groupId: UUID, fromOffsets: IndexSet, toOffset: Int) -> Bool {
        guard let groupIndex = group.participantGroups.firstIndex(where: { $0.id == groupId }) else {
            participantsError = .participantGroupNotFound
            return false
        }

        var userIDs = group.participantGroups[groupIndex].userIds
        userIDs.move(fromOffsets: fromOffsets, toOffset: toOffset)
        group.participantGroups[groupIndex].userIds = normalizedOrderedUserIDs(userIDs)
        participantsError = nil
        recalculate()
        return true
    }

    func participantGroupID(for userId: UUID) -> UUID? {
        group.participantGroups.first(where: { $0.userIds.contains(userId) })?.id
    }

    func moveUser(_ userID: UUID, toParticipantGroupID targetGroupID: UUID?) -> Bool {
        guard group.users.contains(where: { $0.id == userID }) else {
            participantsError = .participantNotFound
            return false
        }

        if let targetGroupID {
            return moveUser(userId: userID, toGroupId: targetGroupID, at: nil)
        }

        return moveUserToIndividuals(userId: userID)
    }

    func isUserGrouped(userId: UUID) -> Bool {
        group.participantGroups.contains { $0.userIds.contains(userId) }
    }

    func standaloneUsers() -> [User] {
        group.users.filter { !isUserGrouped(userId: $0.id) }
    }

    func aggregateKey(for userId: UUID) -> AggregateParticipant {
        if let participantGroup = group.participantGroups.first(where: { $0.userIds.contains(userId) }) {
            return .group(participantGroup.id)
        }
        return .user(userId)
    }

    func aggregateDebts(_ debts: [Debt]) -> [AggregatedDebt] {
        var aggregated: [DebtAggregationKey: Decimal] = [:]

        for debt in debts {
            let fromKey = aggregateKey(for: debt.from)
            let toKey = aggregateKey(for: debt.to)

            if fromKey == toKey {
                continue
            }

            let key = DebtAggregationKey(from: fromKey, to: toKey)
            aggregated[key, default: Decimal.zero] = Money.rounded(
                aggregated[key, default: Decimal.zero] + debt.amount
            )
        }

        return aggregated
            .filter { !Money.isZero($0.value) }
            .map { AggregatedDebt(from: $0.key.from, to: $0.key.to, amount: Money.rounded($0.value)) }
            .sorted { lhs, rhs in
                let lhsFrom = aggregateDisplayName(for: lhs.from)
                let rhsFrom = aggregateDisplayName(for: rhs.from)
                if lhsFrom == rhsFrom {
                    return aggregateDisplayName(for: lhs.to) < aggregateDisplayName(for: rhs.to)
                }
                return lhsFrom < rhsFrom
            }
    }
    
    private func validatedExpense(
        id: UUID,
        title: String,
        amount: Decimal,
        splitMode: ExpenseSplitMode,
        paidBySplits: [UUID: Decimal],
        splits: [UUID: Decimal],
        date: Date,
        categoryId: UUID?,
        note: String?
    ) -> Expense? {
        let cleanedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanedTitle.isEmpty else {
            addExpenseError = .titleEmpty
            return nil
        }

        let normalizedAmount = Money.rounded(amount)
        guard normalizedAmount > 0 else {
            addExpenseError = .amountInvalidPositive
            return nil
        }

        let userIDs = Set(group.users.map(\.id))
        guard !paidBySplits.isEmpty else {
            addExpenseError = .payerRequired
            return nil
        }

        let normalizedPaidBySplits = paidBySplits.mapValues(Money.rounded)
        var paidByTotal = Decimal.zero
        for (userId, amount) in normalizedPaidBySplits {
            guard userIDs.contains(userId) else {
                addExpenseError = .payerOutsideGroup
                return nil
            }
            guard amount >= 0 else {
                addExpenseError = .paidAmountsNegative
                return nil
            }
            paidByTotal = Money.rounded(paidByTotal + amount)
        }

        guard paidByTotal == normalizedAmount else {
            addExpenseError = .paidByMismatch
            return nil
        }

        guard !splits.isEmpty else {
            addExpenseError = .participantRequired
            return nil
        }

        for (userId, splitAmount) in splits {
            guard userIDs.contains(userId) else {
                addExpenseError = .splitsOutsideGroup
                return nil
            }
            guard splitAmount >= 0 else {
                addExpenseError = .splitAmountsNegative
                return nil
            }
        }
        
        let normalizedSplits = splits.mapValues(Money.rounded)
        let splitSum = Money.rounded(normalizedSplits.values.reduce(Decimal.zero, +))
        guard splitSum == normalizedAmount else {
            addExpenseError = .splitMismatch
            return nil
        }

        let expensePaidBySplits = normalizedPaidBySplits
            .sorted { $0.key.uuidString < $1.key.uuidString }
            .map { ExpenseSplit(userId: $0.key, amount: $0.value) }
        let expenseSplits = normalizedSplits
            .sorted { $0.key.uuidString < $1.key.uuidString }
            .map { ExpenseSplit(userId: $0.key, amount: $0.value) }
        
        return Expense(
            id: id,
            title: cleanedTitle,
            amount: normalizedAmount,
            splitMode: splitMode,
            paidBySplits: expensePaidBySplits,
            splits: expenseSplits,
            date: date,
            categoryId: categoryId,
            note: note
        )
    }

    private func removeUserFromAllParticipantGroups(_ userId: UUID) {
        for index in group.participantGroups.indices {
            group.participantGroups[index].userIds.removeAll { $0 == userId }
        }
    }

    private func normalizedOrderedUserIDs(_ userIDs: [UUID]) -> [UUID] {
        let validUserIDs = Set(group.users.map(\.id))
        var seen: Set<UUID> = []
        return userIDs.filter { userId in
            guard validUserIDs.contains(userId), !seen.contains(userId) else {
                return false
            }
            seen.insert(userId)
            return true
        }
    }

    private func applyStandaloneOrder(_ orderedStandaloneIDs: [UUID]) {
        let normalizedStandaloneIDs = normalizedOrderedUserIDs(orderedStandaloneIDs)
        let standaloneSet = Set(normalizedStandaloneIDs)
        var iterator = normalizedStandaloneIDs.makeIterator()

        group.users = group.users.compactMap { user in
            if standaloneSet.contains(user.id) {
                guard let nextID = iterator.next() else {
                    return nil
                }
                return group.users.first(where: { $0.id == nextID })
            }
            return user
        }
    }

    private func adjustedOffset(sourceIndex: Int, destinationIndex: Int, count: Int) -> Int {
        let boundedDestination = max(0, min(destinationIndex, count))
        if sourceIndex < boundedDestination {
            return max(0, boundedDestination - 1)
        }
        return boundedDestination
    }

    func userName(_ id: UUID) -> String {
        group.users.first(where: { $0.id == id })?.name ?? L10n.string(L10n.Common.unknownKey)
    }

    func formatMoney(_ amount: Decimal) -> String {
        CurrencyFormatter.makeCurrencyFormatter().string(from: amount as NSDecimalNumber) ?? "\(amount)"
    }

    func payerDisplayText(for expense: Expense) -> String {
        let payerIDs = expense.paidBySplits.map(\.userId)
        if expense.paidBySplits.count == 1, let payer = expense.paidBySplits.first {
            return userName(payer.userId)
        }

        if let participantGroup = group.participantGroups.first(where: { Set($0.userIds) == Set(payerIDs) }) {
            return participantGroup.name
        }

        return expense.paidBySplits
            .map { userName($0.userId) }
            .joined(separator: ", ")
    }

    func aggregateDisplayName(for participant: AggregateParticipant) -> String {
        switch participant {
        case .user(let userID):
            return userName(userID)
        case .group(let groupID):
            return group.participantGroups.first(where: { $0.id == groupID })?.name ?? L10n.string(L10n.Common.unknownGroupKey)
        }
    }

    private func validateParticipantGroupMembers(userIds: [UUID], excludingGroupID: UUID?) -> Bool {
        let validUserIDs = Set(group.users.map(\.id))
        for userId in userIds {
            guard validUserIDs.contains(userId) else {
                participantsError = .invalidParticipantGroupMembers
                return false
            }
        }

        let takenUserIDs = Set(
            group.participantGroups
                .filter { $0.id != excludingGroupID }
                .flatMap(\.userIds)
        )

        let hasOverlap = userIds.contains { takenUserIDs.contains($0) }
        guard !hasOverlap else {
            participantsError = .participantGroupOverlap
            return false
        }

        return true
    }

    private func validateUniqueUserName(_ name: String, excludingUserID: UUID?) -> Bool {
        let normalizedCandidate = normalizedName(for: name)
        let duplicateExists = group.users.contains { user in
            user.id != excludingUserID && normalizedName(for: user.name) == normalizedCandidate
        }

        guard !duplicateExists else {
            participantsError = .participantAlreadyExists
            return false
        }

        return true
    }

    private func validateUniqueParticipantGroupName(_ name: String, excludingGroupID: UUID?) -> Bool {
        let normalizedCandidate = normalizedName(for: name)
        let duplicateExists = group.participantGroups.contains { participantGroup in
            participantGroup.id != excludingGroupID && normalizedName(for: participantGroup.name) == normalizedCandidate
        }

        guard !duplicateExists else {
            participantsError = .groupAlreadyExists
            return false
        }

        return true
    }

    private func normalizedName(for name: String) -> String {
        name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func mapExpenseError(_ error: Error) -> ExpensePresentationError {
        guard let balanceError = error as? BalanceCalculatorError else {
            return .unknown
        }

        switch balanceError {
        case .invalidPayer:
            return .invalidPayer
        case .invalidParticipant:
            return .invalidParticipant
        case .negativeSplit:
            return .negativeSplit
        case .paidByMismatch(let expenseTitle):
            return .paidByMismatchForExpense(expenseTitle)
        case .splitMismatch(let expenseTitle):
            return .splitMismatchForExpense(expenseTitle)
        case .nonZeroResidual:
            return .nonZeroResidual
        }
    }

}

private struct DebtAggregationKey: Hashable {
    let from: AggregateParticipant
    let to: AggregateParticipant
}

enum CurrencyFormatter {
    static func makeCurrencyFormatter() -> NumberFormatter {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = AppLocalization.currentLocale
        formatter.generatesDecimalNumbers = true
        formatter.maximumFractionDigits = 2
        formatter.minimumFractionDigits = 2
        return formatter
    }
}
