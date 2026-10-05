package com.replyflowhq.app;

import android.app.Activity;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesResponseListener;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/**
 * ReplyflowGooglePlayBillingPlugin
 *
 * Google Play Billing integration for the ReplyFlow monthly subscription.
 *
 * Security contract: this plugin reports purchase tokens to the WebView.
 * Entitlement is granted ONLY after the backend verifies the token via the
 * Play Developer API — a client-side purchase callback alone never activates
 * a subscription.
 */
@CapacitorPlugin(name = "ReplyflowGooglePlayBilling")
public class ReplyflowGooglePlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private static final String TAG = "RF_GooglePlayBilling";

    private BillingClient billingClient;
    private PluginCall pendingPurchaseCall;

    /**
     * Single-flight BillingClient connection state. BillingClient throws
     * IllegalStateException ("Client is already in the process of connecting
     * to billing service") when startConnection is invoked while a connect is
     * already in flight — so only one start may ever be issued, and every
     * other caller queues behind it in pendingOperations.
     */
    private final Object connectionLock = new Object();
    private boolean connectionInProgress = false;
    private final List<PendingOperation> pendingOperations = new ArrayList<>();

    private static class PendingOperation {
        final Runnable onReady;
        final PluginCall call;
        PendingOperation(Runnable onReady, PluginCall call) {
            this.onReady = onReady;
            this.call = call;
        }
    }

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder()
                    .enableOneTimeProducts()
                    .enablePrepaidPlans()
                    .build()
            )
            .build();
    }

    /**
     * Runs onReady once the shared BillingClient connection is usable.
     * If a connection is already established, runs immediately. If one is
     * currently starting, queues behind it — a second startConnection call
     * is never issued. On setup success every queued op runs; on failure
     * every queued call rejects and the in-flight flag clears so the next
     * ensureConnection may reconnect on demand.
     */
    private void ensureConnection(Runnable onReady, PluginCall call) {
        if (billingClient.isReady()) {
            onReady.run();
            return;
        }
        boolean startConnection = false;
        boolean runNow = false;
        synchronized (connectionLock) {
            if (billingClient.isReady()) {
                // Connection landed between the two checks.
                runNow = true;
            } else {
                pendingOperations.add(new PendingOperation(onReady, call));
                if (!connectionInProgress) {
                    connectionInProgress = true;
                    startConnection = true;
                }
            }
        }
        if (runNow) {
            onReady.run();
        } else if (startConnection) {
            startBillingConnection();
        }
        // Otherwise this op is queued behind the connection already starting.
    }

    /**
     * The ONLY call site for billingClient.startConnection — must never be
     * invoked while a connect is already in flight (BillingClient throws).
     */
    private void startBillingConnection() {
        try {
            billingClient.startConnection(new BillingClientStateListener() {
                @Override
                public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                    List<PendingOperation> drained;
                    synchronized (connectionLock) {
                        connectionInProgress = false;
                        drained = new ArrayList<>(pendingOperations);
                        pendingOperations.clear();
                    }
                    if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        for (PendingOperation op : drained) {
                            op.onReady.run();
                        }
                    } else {
                        for (PendingOperation op : drained) {
                            op.call.reject("Billing setup failed: " + billingResult.getDebugMessage(),
                                String.valueOf(billingResult.getResponseCode()));
                        }
                    }
                }

                @Override
                public void onBillingServiceDisconnected() {
                    // The client marks itself not-ready; in-flight async calls
                    // fail on their own. Do NOT reconnect here — the next
                    // ensureConnection starts a fresh single-flight connection
                    // on demand, which also prevents a reconnect racing a new
                    // caller's startConnection.
                    Log.w(TAG, "Billing service disconnected");
                }
            });
        } catch (IllegalStateException e) {
            // A connect was already in flight outside this guard — drain the
            // queue with a clean rejection rather than surfacing BillingClient's
            // raw "already in the process of connecting" error to the user.
            List<PendingOperation> drained;
            synchronized (connectionLock) {
                connectionInProgress = false;
                drained = new ArrayList<>(pendingOperations);
                pendingOperations.clear();
            }
            for (PendingOperation op : drained) {
                op.call.reject("Billing connection start conflict: " + e.getMessage());
            }
        }
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", true);
        call.resolve(result);
    }

    @PluginMethod
    public void getSubscriptionOffer(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null || productId.isEmpty()) {
            call.reject("productId is required");
            return;
        }

        ensureConnection(() -> {
            List<QueryProductDetailsParams.Product> products = new ArrayList<>();
            products.add(QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.SUBS)
                .build());

            QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(products)
                .build();

            billingClient.queryProductDetailsAsync(params, (billingResult, queryResult) -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("queryProductDetails failed: " + billingResult.getDebugMessage(),
                        String.valueOf(billingResult.getResponseCode()));
                    return;
                }

                List<ProductDetails> detailsList = queryResult.getProductDetailsList();
                if (detailsList == null || detailsList.isEmpty()) {
                    call.reject("Product not found in Play Console: " + productId, "PRODUCT_NOT_FOUND");
                    return;
                }

                ProductDetails details = detailsList.get(0);
                List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
                if (offers == null || offers.isEmpty()) {
                    call.reject("No subscription offers configured for: " + productId, "NO_OFFERS");
                    return;
                }

                // Prefer an offer containing a free-trial phase; fall back to the base plan.
                ProductDetails.SubscriptionOfferDetails chosen = offers.get(0);
                boolean hasFreeTrial = false;
                for (ProductDetails.SubscriptionOfferDetails offer : offers) {
                    for (ProductDetails.PricingPhase phase : offer.getPricingPhases().getPricingPhaseList()) {
                        if (phase.getPriceAmountMicros() == 0) {
                            chosen = offer;
                            hasFreeTrial = true;
                            break;
                        }
                    }
                    if (hasFreeTrial) break;
                }

                ProductDetails.PricingPhase firstPhase =
                    chosen.getPricingPhases().getPricingPhaseList().get(0);

                JSObject result = new JSObject();
                result.put("productId", productId);
                result.put("offerToken", chosen.getOfferToken());
                result.put("basePlanId", chosen.getBasePlanId());
                result.put("offerId", chosen.getOfferId());
                result.put("hasFreeTrial", hasFreeTrial);
                result.put("priceFormatted", firstPhase.getFormattedPrice());
                result.put("priceAmountMicros", firstPhase.getPriceAmountMicros());
                result.put("billingPeriod", firstPhase.getBillingPeriod());
                call.resolve(result);
            });
        }, call);
    }

    @PluginMethod
    public void launchPurchase(PluginCall call) {
        String productId = call.getString("productId");
        String offerToken = call.getString("offerToken");
        String obfuscatedAccountId = call.getString("obfuscatedAccountId");
        if (productId == null || offerToken == null) {
            call.reject("productId and offerToken are required");
            return;
        }
        if (pendingPurchaseCall != null) {
            call.reject("A purchase is already in progress", "PURCHASE_IN_PROGRESS");
            return;
        }

        ensureConnection(() -> {
            List<QueryProductDetailsParams.Product> products = new ArrayList<>();
            products.add(QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.SUBS)
                .build());

            QueryProductDetailsParams queryParams = QueryProductDetailsParams.newBuilder()
                .setProductList(products)
                .build();

            billingClient.queryProductDetailsAsync(queryParams, (queryResult, productDetailsResult) -> {
                if (queryResult.getResponseCode() != BillingClient.BillingResponseCode.OK ||
                    productDetailsResult.getProductDetailsList().isEmpty()) {
                    call.reject("Unable to load product for purchase", "PRODUCT_LOAD_FAILED");
                    return;
                }

                ProductDetails details = productDetailsResult.getProductDetailsList().get(0);

                BillingFlowParams.ProductDetailsParams productParams =
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(details)
                        .setOfferToken(offerToken)
                        .build();

                BillingFlowParams.Builder flowBuilder = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(java.util.Collections.singletonList(productParams));
                if (obfuscatedAccountId != null && !obfuscatedAccountId.isEmpty()) {
                    flowBuilder.setObfuscatedAccountId(obfuscatedAccountId);
                }

                Activity activity = getActivity();
                if (activity == null) {
                    call.reject("No activity available", "NO_ACTIVITY");
                    return;
                }

                pendingPurchaseCall = call;
                BillingResult launchResult = billingClient.launchBillingFlow(activity, flowBuilder.build());
                if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    // Synchronous launch failure — onPurchasesUpdated will not fire.
                    pendingPurchaseCall = null;
                    call.reject("Purchase launch failed: " + launchResult.getDebugMessage(),
                        String.valueOf(launchResult.getResponseCode()));
                }
                // Successful launches deliver the result to onPurchasesUpdated.
            });
        }, call);
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult billingResult, @Nullable List<Purchase> purchases) {
        PluginCall call = pendingPurchaseCall;
        if (call == null) {
            Log.w(TAG, "Purchase update with no pending call: code=" + billingResult.getResponseCode());
            return;
        }
        pendingPurchaseCall = null;

        int code = billingResult.getResponseCode();
        JSObject result = new JSObject();

        if (code == BillingClient.BillingResponseCode.OK && purchases != null && !purchases.isEmpty()) {
            Purchase purchase = purchases.get(0);
            if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                result.put("status", "purchased");
                result.put("purchaseToken", purchase.getPurchaseToken());
                result.put("orderId", purchase.getOrderId());
                result.put("products", new JSArray(purchase.getProducts()));
                call.resolve(result);
            } else if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                result.put("status", "pending");
                result.put("products", new JSArray(purchase.getProducts()));
                call.resolve(result);
            } else {
                result.put("status", "error");
                result.put("message", "Unexpected purchase state: " + purchase.getPurchaseState());
                call.resolve(result);
            }
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            result.put("status", "canceled");
            call.resolve(result);
        } else {
            result.put("status", "error");
            result.put("code", code);
            result.put("message", billingResult.getDebugMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void queryPurchases(PluginCall call) {
        ensureConnection(() -> {
            QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build();

            billingClient.queryPurchasesAsync(params, new PurchasesResponseListener() {
                @Override
                public void onQueryPurchasesResponse(@NonNull BillingResult billingResult,
                                                     @NonNull List<Purchase> purchasesList) {
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        call.reject("queryPurchases failed: " + billingResult.getDebugMessage(),
                            String.valueOf(billingResult.getResponseCode()));
                        return;
                    }
                    JSArray arr = new JSArray();
                    for (Purchase p : purchasesList) {
                        JSObject item = new JSObject();
                        item.put("purchaseToken", p.getPurchaseToken());
                        item.put("orderId", p.getOrderId());
                        item.put("products", new JSArray(p.getProducts()));
                        item.put("purchaseState", p.getPurchaseState());
                        item.put("isAcknowledged", p.isAcknowledged());
                        arr.put(item);
                    }
                    JSObject result = new JSObject();
                    result.put("purchases", arr);
                    call.resolve(result);
                }
            });
        }, call);
    }
}
