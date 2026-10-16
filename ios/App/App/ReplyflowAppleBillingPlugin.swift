import Foundation
import Capacitor
import StoreKit

/**
 * Replyflow Apple Billing Plugin — StoreKit 2 (iOS 15+).
 *
 * Native purchase surface for ReplyFlow subscriptions via Apple In-App
 * Purchase. A successful purchase returns the transaction's
 * jwsRepresentation — the signed JWS the backend verifies (x5c → Apple
 * Root CA - G3) before granting entitlement. Client-side callbacks never
 * grant access by themselves.
 *
 * Methods:
 *  - isSupported:           AppStore.canMakePayments
 *  - getSubscriptionOffer:  Product.products → price + introductory offer
 *  - launchPurchase:        product.purchase(options:) incl. appAccountToken
 *  - queryEntitlements:     Transaction.currentEntitlements (auto-renewables)
 *  - sync:                  AppStore.sync() — Restore Purchases
 *  - finishTransaction:     tx.finish() after server verification
 *
 * Transaction.updates forwards verified transactions to JS as
 * "transactionUpdate" events (renewals, Ask-to-Buy approvals, restores).
 */
@objc(ReplyflowAppleBillingPlugin)
public class ReplyflowAppleBillingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ReplyflowAppleBillingPlugin"
    public let jsName = "ReplyflowAppleBilling"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSubscriptionOffer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "launchPurchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise),
    ]

    private var transactionListenerTask: Task<Void, Never>?

    public override func load() {
        // Capacitor calls load() only after registerPluginInstance succeeds —
        // this line in the device console proves the bridge is registered.
        print("[APPLE BILLING] native plugin load() — registered as jsName=\(jsName)")
        transactionListenerTask = Task { [weak self] in
            for await update in Transaction.updates {
                guard let self = self else { return }
                if let transaction = try? self.checkVerified(update) {
                    self.notifyListeners("transactionUpdate", data: [
                        "jwsRepresentation": update.jwsRepresentation,
                        "transactionId": String(transaction.id),
                        "originalTransactionId": String(transaction.originalID),
                        "productId": transaction.productID,
                    ])
                }
            }
        }
    }

    deinit {
        transactionListenerTask?.cancel()
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": AppStore.canMakePayments])
    }

    @objc func getSubscriptionOffer(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), !productId.isEmpty else {
            call.reject("productId is required")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Product not found", "PRODUCT_NOT_FOUND")
                    return
                }
                var result: [String: Any] = [
                    "productId": product.id,
                    "displayName": product.displayName,
                    "description": product.description,
                    "displayPrice": product.displayPrice,
                    "price": NSDecimalNumber(decimal: product.price).doubleValue,
                    "currency": product.priceFormatStyle.currencyCode,
                    "type": product.type == .autoRenewable ? "autoRenewable" : "other",
                ]
                if let subscription = product.subscription {
                    result["subscriptionPeriod"] = periodString(subscription.subscriptionPeriod)
                    if let intro = subscription.introductoryOffer {
                        result["introOffer"] = [
                            "displayPrice": intro.displayPrice,
                            "paymentMode": paymentModeString(intro.paymentMode),
                            "period": periodString(intro.period),
                            "periodCount": intro.periodCount,
                        ]
                    }
                    result["introOfferEligible"] = try await subscription.isEligibleForIntroOffer
                }
                call.resolve(result)
            } catch {
                call.reject("Failed to load product: \(error.localizedDescription)")
            }
        }
    }

    @objc func launchPurchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), !productId.isEmpty else {
            call.reject("productId is required")
            return
        }
        let accountTokenString = call.getString("appAccountToken")
        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Product not found", "PRODUCT_NOT_FOUND")
                    return
                }
                var options: Set<Product.PurchaseOption> = []
                if let tokenString = accountTokenString, let uuid = UUID(uuidString: tokenString) {
                    options.insert(.appAccountToken(uuid))
                }
                let purchaseResult = try await product.purchase(options: options)
                switch purchaseResult {
                case .success(let verification):
                    let transaction = try self.checkVerified(verification)
                    call.resolve([
                        "status": "success",
                        "jwsRepresentation": verification.jwsRepresentation,
                        "transactionId": String(transaction.id),
                        "originalTransactionId": String(transaction.originalID),
                        "productId": transaction.productID,
                    ])
                case .userCancelled:
                    call.resolve(["status": "userCancelled"])
                case .pending:
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.resolve(["status": "pending"])
                }
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func queryEntitlements(_ call: CAPPluginCall) {
        Task {
            var transactions: [[String: Any]] = []
            for await entitlement in Transaction.currentEntitlements {
                if let transaction = try? self.checkVerified(entitlement),
                   transaction.productType == .autoRenewable {
                    transactions.append([
                        "jwsRepresentation": entitlement.jwsRepresentation,
                        "transactionId": String(transaction.id),
                        "originalTransactionId": String(transaction.originalID),
                        "productId": transaction.productID,
                        "expiresDateMs": transaction.expirationDate.map { $0.timeIntervalSince1970 * 1000 } as Any,
                        "revocationDateMs": transaction.revocationDate.map { $0.timeIntervalSince1970 * 1000 } as Any,
                    ])
                }
            }
            call.resolve(["transactions": transactions])
        }
    }

    @objc func sync(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                call.resolve(["ok": true])
            } catch {
                call.reject("Sync failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard let idString = call.getString("transactionId"), let targetId = UInt64(idString) else {
            call.reject("transactionId is required")
            return
        }
        Task {
            var finished = false
            for await result in Transaction.unfinished {
                if let transaction = try? self.checkVerified(result), transaction.id == targetId {
                    await transaction.finish()
                    finished = true
                }
            }
            call.resolve(["finished": finished])
        }
    }

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw AppleBillingError.failedVerification
        case .verified(let safe):
            return safe
        }
    }

    private func paymentModeString(_ mode: Product.SubscriptionOffer.PaymentMode) -> String {
        switch mode {
        case .freeTrial: return "freeTrial"
        case .payAsYouGo: return "payAsYouGo"
        case .payUpFront: return "payUpFront"
        default: return "unknown"
        }
    }

    private func periodString(_ period: Product.SubscriptionPeriod) -> String {
        let unit: String
        switch period.unit {
        case .day: unit = "day"
        case .week: unit = "week"
        case .month: unit = "month"
        case .year: unit = "year"
        default: unit = "unknown"
        }
        return "\(period.value) \(unit)\(period.value == 1 ? "" : "s")"
    }
}

enum AppleBillingError: Error {
    case failedVerification
}
