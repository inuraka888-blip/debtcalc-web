import Foundation

enum BalanceCalculatorError: Error, LocalizedError {
    case invalidPayer
    case invalidParticipant
    case negativeSplit
    case paidByMismatch(expenseTitle: String)
    case splitMismatch(expenseTitle: String)
    case nonZeroResidual

    var errorDescription: String? {
        switch self {
        case .invalidPayer:
            return "Expense payer is not part of the group."
        case .invalidParticipant:
            return "Expense participant is not part of the group."
        case .negativeSplit:
            return "Expense split cannot be negative."
        case .paidByMismatch(let expenseTitle):
            return "Paid-by total does not match expense amount for \(expenseTitle)."
        case .splitMismatch(let expenseTitle):
            return "Expense total and split total do not match for \(expenseTitle)."
        case .nonZeroResidual:
            return "Balances do not sum to zero."
        }
    }
}

enum Money {
    static let scale = 2
    static let zero = Decimal(0)

    static func rounded(_ value: Decimal) -> Decimal {
        var source = value
        var result = Decimal()
        NSDecimalRound(&result, &source, scale, .bankers)
        return result
    }

    static func abs(_ value: Decimal) -> Decimal {
        value < zero ? -value : value
    }

    static func isZero(_ value: Decimal) -> Bool {
        abs(value) <= Decimal(string: "0.005", locale: Locale(identifier: "en_US_POSIX")) ?? Decimal(0.005)
    }
}

enum BalanceCalculator {
    static func calculateBalances(for group: Group) throws -> [UUID: Decimal] {
        try validate(group)

        var balances: [UUID: Decimal] = Dictionary(uniqueKeysWithValues: group.users.map { ($0.id, Money.zero) })

        for expense in group.expenses {
            for payer in expense.paidBySplits {
                balances[payer.userId, default: Money.zero] = Money.rounded(
                    balances[payer.userId, default: Money.zero] + payer.amount
                )
            }

            for split in expense.splits {
                balances[split.userId, default: Money.zero] = Money.rounded(
                    balances[split.userId, default: Money.zero] - split.amount
                )
            }
        }

        let total = Money.rounded(balances.values.reduce(Money.zero, +))
        guard Money.isZero(total) else {
            throw BalanceCalculatorError.nonZeroResidual
        }

        return balances
    }

    static func calculateDebts(for group: Group) throws -> [Debt] {
        let balances = try calculateBalances(for: group)
        // Sorting keeps output deterministic for the same input set.
        var creditors = balances
            .filter { $0.value > Money.zero }
            .map { (id: $0.key, amount: Money.rounded($0.value)) }
            .sorted { lhs, rhs in
                if lhs.amount == rhs.amount {
                    return lhs.id.uuidString < rhs.id.uuidString
                }
                return lhs.amount > rhs.amount
            }

        var debtors = balances
            .filter { $0.value < Money.zero }
            .map { (id: $0.key, amount: Money.rounded($0.value)) }
            .sorted { lhs, rhs in
                if lhs.amount == rhs.amount {
                    return lhs.id.uuidString < rhs.id.uuidString
                }
                return lhs.amount < rhs.amount
            }

        var result: [Debt] = []
        var i = 0
        var j = 0

        while i < debtors.count && j < creditors.count {
            let debtor = debtors[i]
            let creditor = creditors[j]

            let transfer = Money.rounded(min(-debtor.amount, creditor.amount))
            if transfer > Money.zero {
                result.append(Debt(from: debtor.id, to: creditor.id, amount: transfer))
            }

            debtors[i].amount = Money.rounded(debtors[i].amount + transfer)
            creditors[j].amount = Money.rounded(creditors[j].amount - transfer)

            if Money.isZero(debtors[i].amount) {
                i += 1
            }
            if Money.isZero(creditors[j].amount) {
                j += 1
            }
        }

        return result
    }

    static func validate(_ group: Group) throws {
        let userIDs = Set(group.users.map(\.id))

        for expense in group.expenses {
            var paidTotal = Money.zero
            for payer in expense.paidBySplits {
                guard userIDs.contains(payer.userId) else {
                    throw BalanceCalculatorError.invalidPayer
                }
                guard payer.amount >= Money.zero else {
                    throw BalanceCalculatorError.negativeSplit
                }
                paidTotal = Money.rounded(paidTotal + payer.amount)
            }

            var splitTotal = Money.zero
            for split in expense.splits {
                guard userIDs.contains(split.userId) else {
                    throw BalanceCalculatorError.invalidParticipant
                }
                guard split.amount >= Money.zero else {
                    throw BalanceCalculatorError.negativeSplit
                }
                splitTotal = Money.rounded(splitTotal + split.amount)
            }

            let roundedAmount = Money.rounded(expense.amount)
            guard paidTotal == roundedAmount else {
                throw BalanceCalculatorError.paidByMismatch(expenseTitle: expense.title)
            }
            guard splitTotal == roundedAmount else {
                throw BalanceCalculatorError.splitMismatch(expenseTitle: expense.title)
            }
        }
    }
}
