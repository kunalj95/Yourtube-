import React, {
  useEffect,
  useState,
} from "react";

import { useRouter } from "next/router";

import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    Razorpay: any;
  }
}

const plans = [
  {
    name: "Free",
    prices: {
      monthly: 0,
      quarterly: 0,
      yearly: 0,
    },
    features: [
      "Limited premium videos",
      "480p streaming quality",
      "60 minutes watch time/day",
      "1 download/day",
      "Basic platform access",
    ],
  },

  {
    name: "Bronze",
    prices: {
      monthly: 99,
      quarterly: 249,
      yearly: 899,
    },
    features: [
      "More premium video access",
      "720p streaming quality",
      "180 minutes watch time/day",
      "3 downloads/day",
      "Priority content access",
      "Faster streaming",
    ],
  },

  {
    name: "Silver",
    prices: {
      monthly: 199,
      quarterly: 499,
      yearly: 1799,
    },
    features: [
      "Unlimited premium videos",
      "1080p streaming quality",
      "300 minutes watch time/day",
      "5 downloads/day",
      "Priority content access",
      "Faster streaming",
      "Exclusive premium courses",
      "Ad-free viewing",
    ],
  },

  {
    name: "Gold",
    prices: {
      monthly: 299,
      quarterly: 799,
      yearly: 2799,
    },
    features: [
      "Unlimited premium videos",
      "Highest available streaming quality",
      "Unlimited watch time",
      "10 downloads/day",
      "Priority content access",
      "Faster streaming",
      "Exclusive premium courses",
      "Ad-free viewing",
    ],
  },
];

const billingCycles = [
  {
    id: "monthly",
    label: "Monthly",
  },
  {
    id: "quarterly",
    label: "Quarterly",
  },
  {
    id: "yearly",
    label: "Yearly",
  },
];

const index = () => {
  const {
    user,
    firebaseToken,
    login,
  } = useUser();

  const router = useRouter();

  const [billingCycle, setBillingCycle] =
    useState("monthly");

  const [creatingOrder, setCreatingOrder] =
    useState(false);

  const [subscriptionMessage, setSubscriptionMessage] =
    useState("");

  // -----------------------------------------
  // PAYMENT RECOVERY
  // -----------------------------------------

  const [
    pendingPaymentSubscriptionId,
    setPendingPaymentSubscriptionId,
  ] = useState<string | null>(null);

  const [
    recoveringPayment,
    setRecoveringPayment,
  ] = useState(false);

  // -----------------------------------------
  // SUBSCRIPTION API DATA
  // -----------------------------------------

  const [
    subscriptionDetails,
    setSubscriptionDetails,
  ] = useState<any>(null);

  const [
    billingHistory,
    setBillingHistory,
  ] = useState<any[]>([]);

  const [
    loadingSubscriptionData,
    setLoadingSubscriptionData,
  ] = useState(false);

  // -----------------------------------------
  // CURRENT PLAN
  // -----------------------------------------

  const currentPlan =
    subscriptionDetails?.subscription?.plan ||
    user?.subscriptionPlan ||
    "Free";

  const currentExpiry =
    subscriptionDetails?.subscription?.expiryDate ||
    user?.subscriptionExpiresAt ||
    null;

  const expiryDate =
    currentExpiry
      ? new Date(currentExpiry)
      : null;

  const currentStatus =
    subscriptionDetails?.subscription?.status ||
    (
      currentPlan === "Free"
        ? "Active"
        : expiryDate &&
          expiryDate <= new Date()
        ? "Expired"
        : "Active"
    );

  const remainingDays =
    subscriptionDetails?.subscription
      ?.remainingDays ?? null;

  const isExpired =
    currentStatus === "Expired";

  // -----------------------------------------
  // FORMAT DATE
  // -----------------------------------------

  const formatDate = (
    date: string | Date | null
  ) => {
    if (!date) {
      return "Not available";
    }

    const parsedDate =
      new Date(date);

    if (
      Number.isNaN(
        parsedDate.getTime()
      )
    ) {
      return "Not available";
    }

    return parsedDate.toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  };

  // -----------------------------------------
  // LOAD SUBSCRIPTION DATA
  // -----------------------------------------

  const fetchSubscriptionData =
    async () => {
      if (!firebaseToken) {
        return;
      }

      try {
        setLoadingSubscriptionData(
          true
        );

        const [
          detailsResponse,
          historyResponse,
        ] = await Promise.all([
          axiosInstance.get(
            "/subscription/details",
            {
              headers: {
                Authorization:
                  `Bearer ${firebaseToken}`,
              },
            }
          ),

          axiosInstance.get(
            "/subscription/billing-history",
            {
              headers: {
                Authorization:
                  `Bearer ${firebaseToken}`,
              },
            }
          ),
        ]);

        console.log(
          "Subscription details:",
          detailsResponse.data
        );

        console.log(
          "Billing history:",
          historyResponse.data
        );

        setSubscriptionDetails(
          detailsResponse.data
        );

        setBillingHistory(
          historyResponse.data
            ?.billingHistory || []
        );

      } catch (error: any) {
        console.error(
          "Subscription data fetch error:",
          error
        );

        setSubscriptionMessage(
          error?.response?.data?.message ||
            "Unable to load subscription information."
        );

      } finally {
        setLoadingSubscriptionData(
          false
        );
      }
    };

  // -----------------------------------------
  // FETCH DATA WHEN FIREBASE TOKEN IS READY
  // -----------------------------------------

  useEffect(() => {
    if (firebaseToken) {
      fetchSubscriptionData();
    }
  }, [firebaseToken]);

  // -----------------------------------------
  // LOAD RAZORPAY CHECKOUT SCRIPT
  // -----------------------------------------

  const loadRazorpayScript = () => {
    return new Promise<boolean>(
      (resolve) => {
        // Already loaded
        if (window.Razorpay) {
          resolve(true);
          return;
        }

        const existingScript =
          document.querySelector(
            'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
          );

        if (existingScript) {
          existingScript.addEventListener(
            "load",
            () => resolve(true)
          );

          existingScript.addEventListener(
            "error",
            () => resolve(false)
          );

          return;
        }

        const script =
          document.createElement(
            "script"
          );

        script.src =
          "https://checkout.razorpay.com/v1/checkout.js";

        script.async = true;

        script.onload = () => {
          resolve(true);
        };

        script.onerror = () => {
          resolve(false);
        };

        document.body.appendChild(
          script
        );
      }
    );
  };

  // -----------------------------------------
  // CANCEL PENDING SUBSCRIPTION ORDER
  // -----------------------------------------

  const cancelPendingSubscriptionOrder =
    async (
      subscriptionId: string,
      reason: string
    ) => {
      try {
        if (!firebaseToken) {
          return;
        }

        await axiosInstance.post(
          "/subscription/cancel-order",
          {
            subscriptionId,
            cancellationReason:
              reason,
          },
          {
            headers: {
              Authorization:
                `Bearer ${firebaseToken}`,
            },
          }
        );

        console.log(
          "Unpaid subscription order cancelled."
        );

      } catch (error: any) {
        console.error(
          "Unable to cancel unpaid subscription order:",
          error
        );
      }
    };

  // -----------------------------------------
  // CHECK PAYMENT RECOVERY ERROR
  // -----------------------------------------

  const isNetworkError = (
    error: any
  ) => {
    if (!error) {
      return false;
    }

    if (
      error?.code ===
      "ERR_NETWORK"
    ) {
      return true;
    }

    if (
      error?.code ===
      "ECONNABORTED"
    ) {
      return true;
    }

    if (!error?.response) {
      return true;
    }

    const errorMessage =
      error?.message
        ?.toLowerCase?.() || "";

    return (
      errorMessage.includes(
        "network"
      ) ||
      errorMessage.includes(
        "timeout"
      ) ||
      errorMessage.includes(
        "connection"
      )
    );
  };

  // -----------------------------------------
  // HANDLE PAYMENT RECOVERY
  // -----------------------------------------

  const handleRecoverPayment =
    async () => {
      if (
        !pendingPaymentSubscriptionId
      ) {
        setSubscriptionMessage(
          "There is no payment waiting for recovery."
        );

        return;
      }

      if (!firebaseToken) {
        setSubscriptionMessage(
          "Authentication is still loading. Please try again."
        );

        return;
      }

      try {
        setRecoveringPayment(
          true
        );

        setSubscriptionMessage(
          "Checking Razorpay payment status..."
        );

        const response =
          await axiosInstance.get(
            `/subscription/reconcile-payment/${pendingPaymentSubscriptionId}`,
            {
              headers: {
                Authorization:
                  `Bearer ${firebaseToken}`,
              },
            }
          );

        const recoveryData =
          response.data;

        console.log(
          "Payment recovery response:",
          recoveryData
        );

        // -----------------------------------------
        // Payment successfully recovered
        // -----------------------------------------

        if (
          recoveryData?.recovered &&
          recoveryData?.subscription
        ) {
          const recoveredSubscription =
            recoveryData
              .subscription;

          // -----------------------------------------
          // Update local user
          // -----------------------------------------

          if (
            login
          ) {
            login({
              ...user,

              subscriptionPlan:
                recoveredSubscription
                  .plan,

              subscriptionExpiresAt:
                recoveredSubscription
                  .subscriptionExpiryDate,
            });
          }

          // -----------------------------------------
          // Refresh subscription data
          // -----------------------------------------

          await fetchSubscriptionData();

          // -----------------------------------------
          // Clear recovery state
          // -----------------------------------------

          setPendingPaymentSubscriptionId(
            null
          );

          // -----------------------------------------
          // Success message
          // -----------------------------------------

          if (
            recoveryData
              .alreadyProcessed
          ) {
            setSubscriptionMessage(
              "Payment was already processed. Your subscription is active."
            );
          } else {
            setSubscriptionMessage(
              "Payment recovered successfully. Your subscription is now active."
            );
          }

          return;
        }

        // -----------------------------------------
        // Payment not captured yet
        // -----------------------------------------

        if (
          recoveryData?.paymentStatus
        ) {
          setSubscriptionMessage(
            recoveryData
              ?.message ||
              `Payment status: ${recoveryData.paymentStatus}.`
          );

          return;
        }

        setSubscriptionMessage(
          "Payment has not been completed yet. Please try again later."
        );

      } catch (error: any) {
        console.error(
          "Payment recovery failed:",
          error
        );

        const message =
          error?.response?.data
            ?.message ||
          "Unable to check payment status. Please try again.";

        setSubscriptionMessage(
          message
        );

      } finally {
        setRecoveringPayment(
          false
        );
      }
    };

  // -----------------------------------------
  // HANDLE PLAN PURCHASE / UPGRADE / DOWNGRADE
  // -----------------------------------------

  const handleSelectPlan = async (
    planName: string
  ) => {
    setSubscriptionMessage("");

    setPendingPaymentSubscriptionId(
      null
    );

    // -----------------------------------------
    // 1. Check login
    // -----------------------------------------

    if (!user?._id) {
      setSubscriptionMessage(
        "Please sign in to continue."
      );

      return;
    }

    // -----------------------------------------
    // 2. Check Firebase token
    // -----------------------------------------

    if (!firebaseToken) {
      setSubscriptionMessage(
        "Authentication is still loading. Please try again."
      );

      return;
    }

    // -----------------------------------------
    // 3. Free plan doesn't need payment
    // -----------------------------------------

    if (planName === "Free") {
      setSubscriptionMessage(
        "Free plan does not require payment."
      );

      return;
    }

    try {
      setCreatingOrder(true);

      // -----------------------------------------
      // 4. Load Razorpay Checkout
      // -----------------------------------------

      const razorpayLoaded =
        await loadRazorpayScript();

      if (!razorpayLoaded) {
        setSubscriptionMessage(
          "Unable to load Razorpay Checkout. Please try again."
        );

        return;
      }

      // -----------------------------------------
      // 5. Create order on backend
      // -----------------------------------------

      const response =
        await axiosInstance.post(
          "/subscription/create-order",
          {
            userId: user._id,
            plan: planName,
            billingCycle,
          },
          {
            headers: {
              Authorization:
                `Bearer ${firebaseToken}`,
            },
          }
        );

      const orderData =
        response.data;

      console.log(
        "Subscription order created:",
        orderData
      );

      // -----------------------------------------
      // 6. Validate order data
      // -----------------------------------------

      if (!orderData?.orderId) {
        setSubscriptionMessage(
          "Razorpay order was not created."
        );

        return;
      }

      if (!orderData?.keyId) {
        setSubscriptionMessage(
          "Razorpay key ID was not received."
        );

        return;
      }

      // -----------------------------------------
      // 7. Open Razorpay Checkout
      // -----------------------------------------

      const options = {
        key:
          orderData.keyId,

        amount:
          orderData.amount,

        currency:
          orderData.currency || "INR",

        name: "YourTube",

        description:
          `${planName} ${billingCycle} Subscription`,

        order_id:
          orderData.orderId,

        prefill: {
          name:
            user?.name || "",

          email:
            user?.email || "",
        },

        notes: {
          plan:
            planName,

          billingCycle,

          subscriptionId:
            orderData.subscriptionId,
        },

        theme: {
          color: "#000000",
        },

        // -----------------------------------------
        // Successful Checkout response
        // -----------------------------------------

        handler: async function (
          razorpayResponse: any
        ) {
          try {
            console.log(
              "Razorpay payment response:",
              razorpayResponse
            );

            setSubscriptionMessage(
              "Payment received. Verifying payment..."
            );

            // -----------------------------------------
            // 8. Verify payment on backend
            // -----------------------------------------

            const verificationResponse =
              await axiosInstance.post(
                "/subscription/verify-payment",
                {
                  subscriptionId:
                    orderData.subscriptionId,

                  razorpayPaymentId:
                    razorpayResponse
                      .razorpay_payment_id,

                  razorpayOrderId:
                    razorpayResponse
                      .razorpay_order_id,

                  razorpaySignature:
                    razorpayResponse
                      .razorpay_signature,
                },
                {
                  headers: {
                    Authorization:
                      `Bearer ${firebaseToken}`,
                  },
                }
              );

            console.log(
              "Payment verification response:",
              verificationResponse.data
            );

            // -----------------------------------------
            // 9. Update local user
            // -----------------------------------------

            const verifiedSubscription =
              verificationResponse.data
                ?.subscription;

            if (
              verifiedSubscription &&
              login
            ) {
              login({
                ...user,

                subscriptionPlan:
                  verifiedSubscription
                    .plan,

                subscriptionExpiresAt:
                  verifiedSubscription
                    .subscriptionExpiryDate,
              });
            }

            // -----------------------------------------
            // 10. Refresh subscription data
            // -----------------------------------------

            await fetchSubscriptionData();

            // -----------------------------------------
            // 11. Clear recovery state
            // -----------------------------------------

            setPendingPaymentSubscriptionId(
              null
            );

            // -----------------------------------------
            // 12. Success message
            // -----------------------------------------

            setSubscriptionMessage(
              "Payment verified successfully. Your subscription is now active."
            );

          } catch (error: any) {
            console.error(
              "Payment verification failed:",
              error
            );

            const verificationError =
              error?.response?.data
                ?.message ||
              "Payment verification failed.";

            setSubscriptionMessage(
              verificationError
            );

            // -----------------------------------------
            // NETWORK INTERRUPTION RECOVERY
            // -----------------------------------------

            if (
              isNetworkError(error)
            ) {
              console.warn(
                "Payment verification may have been interrupted by a network error."
              );

              setPendingPaymentSubscriptionId(
                orderData.subscriptionId
              );

              setSubscriptionMessage(
                "Payment may have been completed, but verification was interrupted. Please check payment status."
              );
            }
          }
        },

        // -----------------------------------------
        // Payment window closed
        // -----------------------------------------

        modal: {
          ondismiss: async function () {
            console.log(
              "Razorpay Checkout closed."
            );

            await cancelPendingSubscriptionOrder(
              orderData.subscriptionId,
              "Checkout closed by user"
            );

            setSubscriptionMessage(
              "Payment window was closed."
            );
          },
        },
      };

      const razorpay =
        new window.Razorpay(
          options
        );

      // -----------------------------------------
      // Handle payment.failed event
      // -----------------------------------------

      razorpay.on(
        "payment.failed",
        function (
          response: any
        ) {
          console.error(
            "Razorpay payment failed:",
            response
          );

          const reason =
            response?.error
              ?.description ||
            "Payment failed. Please try again.";

          setSubscriptionMessage(
            reason
          );

          setPendingPaymentSubscriptionId(
            null
          );
        }
      );

      razorpay.open();

    } catch (error: any) {
      console.error(
        "Subscription payment error:",
        error
      );

      const message =
        error?.response?.data?.message ||
        "Unable to start subscription payment.";

      setSubscriptionMessage(
        message
      );

    } finally {
      setCreatingOrder(false);
    }
  };

  // -----------------------------------------
  // HANDLE SUBSCRIPTION RENEWAL
  // -----------------------------------------

  const handleRenewSubscription =
    async () => {

      setSubscriptionMessage("");

      setPendingPaymentSubscriptionId(
        null
      );

      // -----------------------------------------
      // 1. Check login
      // -----------------------------------------

      if (!user?._id) {
        setSubscriptionMessage(
          "Please sign in to continue."
        );

        return;
      }

      // -----------------------------------------
      // 2. Check Firebase token
      // -----------------------------------------

      if (!firebaseToken) {
        setSubscriptionMessage(
          "Authentication is still loading. Please try again."
        );

        return;
      }

      // -----------------------------------------
      // 3. Free plan cannot renew
      // -----------------------------------------

      if (
        currentPlan === "Free"
      ) {
        setSubscriptionMessage(
          "Free plan does not require renewal."
        );

        return;
      }

      try {
        setCreatingOrder(true);

        // -----------------------------------------
        // 4. Load Razorpay Checkout
        // -----------------------------------------

        const razorpayLoaded =
          await loadRazorpayScript();

        if (!razorpayLoaded) {
          setSubscriptionMessage(
            "Unable to load Razorpay Checkout. Please try again."
          );

          return;
        }

        // -----------------------------------------
        // 5. Create renewal order
        // -----------------------------------------

        const response =
          await axiosInstance.post(
            "/subscription/renew",
            {
              billingCycle,
            },
            {
              headers: {
                Authorization:
                  `Bearer ${firebaseToken}`,
              },
            }
          );

        const orderData =
          response.data;

        console.log(
          "Renewal order created:",
          orderData
        );

        // -----------------------------------------
        // 6. Validate renewal order
        // -----------------------------------------

        if (!orderData?.orderId) {
          setSubscriptionMessage(
            "Renewal Razorpay order was not created."
          );

          return;
        }

        if (!orderData?.keyId) {
          setSubscriptionMessage(
            "Razorpay key ID was not received."
          );

          return;
        }

        // -----------------------------------------
        // 7. Open Razorpay Checkout
        // -----------------------------------------

        const options = {
          key:
            orderData.keyId,

          amount:
            orderData.amount,

          currency:
            orderData.currency || "INR",

          name: "YourTube",

          description:
            `${currentPlan} ${billingCycle} Renewal`,

          order_id:
            orderData.orderId,

          prefill: {
            name:
              user?.name || "",

            email:
              user?.email || "",
          },

          notes: {
            plan:
              currentPlan,

            billingCycle,

            action:
              "renewal",

            subscriptionId:
              orderData.subscriptionId,
          },

          theme: {
            color: "#000000",
          },

          // -----------------------------------------
          // Successful renewal payment
          // -----------------------------------------

          handler: async function (
            razorpayResponse: any
          ) {
            try {
              console.log(
                "Razorpay renewal payment response:",
                razorpayResponse
              );

              setSubscriptionMessage(
                "Renewal payment received. Verifying payment..."
              );

              // -----------------------------------------
              // 8. Verify renewal payment
              // -----------------------------------------

              const verificationResponse =
                await axiosInstance.post(
                  "/subscription/verify-payment",
                  {
                    subscriptionId:
                      orderData.subscriptionId,

                    razorpayPaymentId:
                      razorpayResponse
                        .razorpay_payment_id,

                    razorpayOrderId:
                      razorpayResponse
                        .razorpay_order_id,

                    razorpaySignature:
                      razorpayResponse
                        .razorpay_signature,
                  },
                  {
                    headers: {
                      Authorization:
                        `Bearer ${firebaseToken}`,
                    },
                  }
                );

              console.log(
                "Renewal verification response:",
                verificationResponse.data
              );

              // -----------------------------------------
              // 9. Update local user
              // -----------------------------------------

              const verifiedSubscription =
                verificationResponse.data
                  ?.subscription;

              if (
                verifiedSubscription &&
                login
              ) {
                login({
                  ...user,

                  subscriptionPlan:
                    verifiedSubscription
                      .plan,

                  subscriptionExpiresAt:
                    verifiedSubscription
                      .subscriptionExpiryDate,
                });
              }

              // -----------------------------------------
              // 10. Refresh subscription data
              // -----------------------------------------

              await fetchSubscriptionData();

              // -----------------------------------------
              // 11. Clear recovery state
              // -----------------------------------------

              setPendingPaymentSubscriptionId(
                null
              );

              // -----------------------------------------
              // 12. Success message
              // -----------------------------------------

              setSubscriptionMessage(
                "Renewal payment verified successfully. Your subscription has been renewed."
              );

            } catch (error: any) {
              console.error(
                "Renewal payment verification failed:",
                error
              );

              const verificationError =
                error?.response?.data
                  ?.message ||
                "Renewal payment verification failed.";

              setSubscriptionMessage(
                verificationError
              );

              // -----------------------------------------
              // NETWORK INTERRUPTION RECOVERY
              // -----------------------------------------

              if (
                isNetworkError(error)
              ) {
                console.warn(
                  "Renewal payment verification may have been interrupted by a network error."
                );

                setPendingPaymentSubscriptionId(
                  orderData.subscriptionId
                );

                setSubscriptionMessage(
                  "Renewal payment may have been completed, but verification was interrupted. Please check payment status."
                );
              }
            }
          },

          // -----------------------------------------
          // Payment window closed
          // -----------------------------------------

          modal: {
            ondismiss: async function () {
              console.log(
                "Razorpay renewal checkout closed."
              );

              await cancelPendingSubscriptionOrder(
                orderData.subscriptionId,
                "Renewal checkout closed by user"
              );

              setSubscriptionMessage(
                "Renewal payment window was closed."
              );
            },
          },
        };

        const razorpay =
          new window.Razorpay(
            options
          );

        // -----------------------------------------
        // Handle renewal payment.failed
        // -----------------------------------------

        razorpay.on(
          "payment.failed",
          function (
            response: any
          ) {
            console.error(
              "Razorpay renewal payment failed:",
              response
            );

            const reason =
              response?.error
                ?.description ||
              "Renewal payment failed. Please try again.";

            setSubscriptionMessage(
              reason
            );

            setPendingPaymentSubscriptionId(
              null
            );
          }
        );

        razorpay.open();

      } catch (error: any) {
        console.error(
          "Renewal order error:",
          error
        );

        const message =
          error?.response?.data?.message ||
          "Unable to start subscription renewal.";

        setSubscriptionMessage(
          message
        );

      } finally {
        setCreatingOrder(false);
      }
    };

  return (
    <div className="flex-1 min-h-screen bg-white">

      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* =====================================
            PAGE HEADER
        ===================================== */}

        <div className="mb-8">

          <h1 className="text-3xl font-bold">
            Subscription
          </h1>

          <p className="text-gray-600 mt-2">
            Compare plans and manage your membership.
          </p>

          {subscriptionMessage && (
            <p className="text-sm text-gray-700 mt-3">
              {subscriptionMessage}
            </p>
          )}

          {/* ---------------------------------
              PAYMENT RECOVERY
          --------------------------------- */}

          {pendingPaymentSubscriptionId && (
            <div className="mt-4 flex flex-wrap items-center gap-3">

              <Button
                variant="outline"
                onClick={
                  handleRecoverPayment
                }
                disabled={
                  recoveringPayment ||
                  creatingOrder
                }
              >
                {recoveringPayment
                  ? "Checking Payment..."
                  : "Check Payment Status"}
              </Button>

              <p className="text-sm text-gray-500">
                Your payment may have completed.
                Check the payment status to recover
                the subscription.
              </p>

            </div>
          )}

        </div>

        {/* =====================================
            CURRENT SUBSCRIPTION
        ===================================== */}

        <div className="border rounded-lg p-6 mb-8">

          <h2 className="text-xl font-semibold mb-4">
            Current Subscription
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            <div>
              <p className="text-sm text-gray-500">
                Current Plan
              </p>

              <p className="text-lg font-semibold mt-1">
                {loadingSubscriptionData
                  ? "Loading..."
                  : currentPlan}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">
                Status
              </p>

              <p className="text-lg font-semibold mt-1">
                {loadingSubscriptionData
                  ? "Loading..."
                  : remainingDays !== null &&
                    currentPlan !== "Free"
                  ? `${currentStatus} (${remainingDays} days left)`
                  : currentStatus}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">
                Valid Until
              </p>

              <p className="text-lg font-semibold mt-1">
                {loadingSubscriptionData
                  ? "Loading..."
                  : currentPlan === "Free"
                  ? "No expiry"
                  : formatDate(
                      expiryDate
                    )}
              </p>
            </div>

          </div>

          {/* ---------------------------------
              RENEW SUBSCRIPTION
          --------------------------------- */}

          {currentPlan !== "Free" && (
            <div className="mt-6 pt-6 border-t">

              <Button
                onClick={
                  handleRenewSubscription
                }
                disabled={
                  creatingOrder
                }
              >
                {creatingOrder
                  ? "Opening Checkout..."
                  : "Renew Subscription"}
              </Button>

            </div>
          )}

        </div>

        {/* =====================================
            BILLING CYCLE
        ===================================== */}

        <div className="flex flex-wrap gap-2 mb-8">

          {billingCycles.map(
            (cycle) => (
              <Button
                key={cycle.id}
                variant={
                  billingCycle === cycle.id
                    ? "default"
                    : "outline"
                }
                onClick={() =>
                  setBillingCycle(
                    cycle.id
                  )
                }
                disabled={
                  creatingOrder
                }
              >
                {cycle.label}
              </Button>
            )
          )}

        </div>

        {/* =====================================
            PLAN COMPARISON
        ===================================== */}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

          {plans.map(
            (plan) => {

              const price =
                plan.prices[
                  billingCycle as keyof typeof plan.prices
                ];

              const isCurrent =
                currentPlan ===
                  plan.name &&
                !isExpired;

              return (
                <div
                  key={plan.name}
                  className={`border rounded-lg p-6 flex flex-col ${
                    isCurrent
                      ? "border-black"
                      : ""
                  }`}
                >

                  {/* ---------------------------------
                      PLAN NAME
                  --------------------------------- */}

                  <h2 className="text-xl font-bold">
                    {plan.name}
                  </h2>

                  {/* ---------------------------------
                      PRICE
                  --------------------------------- */}

                  <div className="mt-4 mb-6">

                    <span className="text-3xl font-bold">
                      ₹{price}
                    </span>

                    <span className="text-sm text-gray-500 ml-1">
                      /{" "}
                      {billingCycle ===
                      "monthly"
                        ? "month"
                        : billingCycle ===
                          "quarterly"
                        ? "quarter"
                        : "year"}
                    </span>

                  </div>

                  {/* ---------------------------------
                      FEATURES
                  --------------------------------- */}

                  <div className="space-y-3 flex-1">

                    {plan.features.map(
                      (feature) => (
                        <div
                          key={feature}
                          className="text-sm text-gray-700"
                        >
                          ✓ {feature}
                        </div>
                      )
                    )}

                  </div>

                  {/* ---------------------------------
                      PLAN BUTTON
                  --------------------------------- */}

                  <div className="mt-6">

                    {isCurrent ? (

                      <Button
                        className="w-full"
                        variant="outline"
                        disabled
                      >
                        Current Plan
                      </Button>

                    ) : plan.name ===
                      "Free" ? (

                      <Button
                        className="w-full"
                        variant="outline"
                        disabled
                      >
                        Free Plan
                      </Button>

                    ) : (

                      <Button
                        className="w-full"
                        onClick={() =>
                          handleSelectPlan(
                            plan.name
                          )
                        }
                        disabled={
                          creatingOrder
                        }
                      >
                        {creatingOrder
                          ? "Opening Checkout..."
                          : `Select ${plan.name}`}
                      </Button>

                    )}

                  </div>

                </div>
              );
            }
          )}

        </div>

        {/* =====================================
            BILLING INFORMATION
        ===================================== */}

        <div className="mt-8 border rounded-lg p-6">

          <h2 className="text-xl font-semibold mb-3">
            Billing Information
          </h2>

          <p className="text-sm text-gray-600 mb-5">
            Your billing history, payment details,
            renewal information, and invoices.
          </p>

          {loadingSubscriptionData ? (

            <p className="text-sm text-gray-500">
              Loading billing history...
            </p>

          ) : billingHistory.length === 0 ? (

            <p className="text-sm text-gray-500">
              No billing history available.
            </p>

          ) : (

            <div className="space-y-4">

              {billingHistory.map(
                (item) => (
                  <div
                    key={item.id}
                    className="border rounded-lg p-4"
                  >

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

                      <div>
                        <p className="text-xs text-gray-500">
                          Plan
                        </p>

                        <p className="text-sm font-semibold mt-1">
                          {item.plan}
                        </p>

                        <p className="text-xs text-gray-500 mt-1">
                          {item.billingCycle}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">
                          Amount
                        </p>

                        <p className="text-sm font-semibold mt-1">
                          {item.currency}{" "}
                          {item.amount}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">
                          Status
                        </p>

                        <p className="text-sm font-semibold mt-1">
                          {item.paymentStatus}
                        </p>

                        <p className="text-xs text-gray-500 mt-1">
                          {formatDate(
                            item.paidAt ||
                              item.createdAt
                          )}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">
                          Invoice
                        </p>

                        <p className="text-sm font-semibold mt-1">
                          {item.invoiceNumber ||
                            "Not available"}
                        </p>

                        <p className="text-xs text-gray-500 mt-1">
                          {item.action}
                        </p>
                      </div>

                    </div>

                    {/* ---------------------------------
                        VIEW INVOICE
                    --------------------------------- */}

                    {item.paymentStatus ===
                      "paid" &&
                      item.invoiceNumber && (
                        <div className="mt-4 flex justify-end">

                          <Button
                            variant="outline"
                            onClick={() =>
                              router.push(
                                `/invoice/${item.id}`
                              )
                            }
                          >
                            View Invoice
                          </Button>

                        </div>
                      )}

                  </div>
                )
              )}

            </div>

          )}

        </div>

      </div>

    </div>
  );
};

export default index;