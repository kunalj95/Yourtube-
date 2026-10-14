import crypto from "crypto";

import users from "../Modals/Auth.js";
import subscriptions from "../Modals/Subscription.js";

import SUBSCRIPTION_PLANS from "../config/subscriptionPlans.js";

import razorpay, {
  RAZORPAY_KEY_ID,
} from "../config/razorpay.js";

import {
  sendSubscriptionConfirmationEmail,
} from "../services/subscriptionEmail.js";


// =====================================================
// HELPER FUNCTIONS
// =====================================================


// -----------------------------------------
// GET SUBSCRIPTION DURATION
// -----------------------------------------

const getDurationInDays = (
  billingCycle
) => {
  if (billingCycle === "monthly") {
    return 30;
  }

  if (billingCycle === "quarterly") {
    return 90;
  }

  if (billingCycle === "yearly") {
    return 365;
  }

  return 0;
};


// -----------------------------------------
// GET PLAN RANK
// -----------------------------------------

const getPlanRank = (plan) => {
  const ranks = {
    Free: 0,
    Bronze: 1,
    Silver: 2,
    Gold: 3,
  };

  return ranks[plan] ?? -1;
};


// -----------------------------------------
// GENERATE INVOICE NUMBER
// -----------------------------------------

const generateInvoiceNumber = () => {
  const now = new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const randomNumber =
    Math.floor(
      100000 + Math.random() * 900000
    );

  return `INV-${year}${month}-${randomNumber}`;
};


// =====================================================
// AUTO DOWNGRADE EXPIRED SUBSCRIPTION
// =====================================================

const autoDowngradeExpiredSubscription =
  async (user) => {
    try {

      // -----------------------------------------
      // Free users do not need expiry checking
      // -----------------------------------------

      if (
        user.subscriptionPlan ===
        "Free"
      ) {
        return user;
      }


      // -----------------------------------------
      // No expiry date
      // -----------------------------------------

      if (
        !user.subscriptionExpiresAt
      ) {
        return user;
      }


      // -----------------------------------------
      // Check expiry
      // -----------------------------------------

      const now =
        new Date();

      const expiryDate =
        new Date(
          user.subscriptionExpiresAt
        );


      // Subscription is still active
      if (
        expiryDate > now
      ) {
        return user;
      }


      // -----------------------------------------
      // Subscription has expired
      // -----------------------------------------

      user.subscriptionPlan =
        "Free";

      user.subscriptionExpiresAt =
        null;


      await user.save();


      return user;

    } catch (error) {

      console.error(
        "Auto downgrade expired subscription error:",
        error
      );

      throw error;
    }
  };


// =====================================================
// CREATE SUBSCRIPTION ORDER
// =====================================================

export const createSubscriptionOrder =
  async (
    req,
    res
  ) => {

    try {

      // -----------------------------------------
      // 1. Get Firebase user's email
      // -----------------------------------------

      const email =
        req.firebaseUser?.email;

      if (!email) {
        return res.status(401).json({
          message:
            "Authenticated user email not found.",
        });
      }


      // -----------------------------------------
      // 2. Get request data
      // -----------------------------------------

      const {
        plan,
        billingCycle,
      } = req.body;


      // -----------------------------------------
      // 3. Validate plan
      // -----------------------------------------

      if (!plan) {
        return res.status(400).json({
          message:
            "Subscription plan is required.",
        });
      }


      // -----------------------------------------
      // 4. Validate billing cycle
      // -----------------------------------------

      if (!billingCycle) {
        return res.status(400).json({
          message:
            "Billing cycle is required.",
        });
      }


      // -----------------------------------------
      // 5. Check selected plan
      // -----------------------------------------

      const selectedPlan =
        SUBSCRIPTION_PLANS[
          plan
        ];

      if (!selectedPlan) {
        return res.status(400).json({
          message:
            "Invalid subscription plan.",
        });
      }


      // -----------------------------------------
      // 6. Validate billing cycle
      // -----------------------------------------

      if (
        !selectedPlan.price ||
        selectedPlan.price[
          billingCycle
        ] === undefined
      ) {
        return res.status(400).json({
          message:
            "Invalid billing cycle.",
        });
      }


      // -----------------------------------------
      // 7. Find user
      // -----------------------------------------

      const user =
        await users.findOne({
          email,
        });

      if (!user) {
        return res.status(404).json({
          message:
            "User not found.",
        });
      }


      // -----------------------------------------
      // 8. Get current subscription
      // -----------------------------------------

      let currentPlan =
        user.subscriptionPlan ||
        "Free";

      const currentExpiry =
        user.subscriptionExpiresAt ||
        null;


      // -----------------------------------------
      // 9. Treat expired subscription as Free
      // -----------------------------------------

      if (
        currentPlan !== "Free" &&
        currentExpiry &&
        new Date(
          currentExpiry
        ) <= new Date()
      ) {
        currentPlan = "Free";
      }


      // -----------------------------------------
      // 10. Determine plan ranks
      // -----------------------------------------

      const currentRank =
        getPlanRank(
          currentPlan
        );

      const selectedRank =
        getPlanRank(
          plan
        );


      // -----------------------------------------
      // 11. Determine action
      // -----------------------------------------

      let action =
        "purchase";


      // Free → Paid
      if (
        currentPlan === "Free"
      ) {
        action =
          "purchase";
      }

      // Paid → Higher plan
      else if (
        selectedRank >
        currentRank
      ) {
        action =
          "upgrade";
      }

      // Paid → Lower plan
      else if (
        selectedRank <
        currentRank
      ) {
        action =
          "downgrade";
      }

      // Same plan
      else {
        return res.status(400).json({
          message:
            "You are already subscribed to this plan.",
        });
      }


      // -----------------------------------------
      // 12. Get amount
      // -----------------------------------------

      const amount =
        selectedPlan.price[
          billingCycle
        ];


      if (
        typeof amount !==
          "number" ||
        amount < 0
      ) {
        return res.status(400).json({
          message:
            "Invalid subscription amount.",
        });
      }


      // -----------------------------------------
      // 13. Create Razorpay order
      // -----------------------------------------

      const razorpayOrder =
        await razorpay.orders.create({
          amount:
            amount * 100,

          currency:
            "INR",

          receipt:
            `sub_${Date.now()}`,

          notes: {
            userId:
              user._id.toString(),

            plan,

            billingCycle,

            action,
          },
        });


      // -----------------------------------------
      // 14. Save subscription transaction
      // -----------------------------------------

      const subscription =
        await subscriptions.create({
          userId:
            user._id,

          plan,

          billingCycle,

          amount,

          currency:
            "INR",

          razorpayOrderId:
            razorpayOrder.id,

          paymentStatus:
            "created",

          action,

          isRenewal:
            false,

          autoRenew:
            false,
        });


      // -----------------------------------------
      // 15. Return order information
      // -----------------------------------------

      return res.status(201).json({

        message:
          "Subscription order created successfully.",

        keyId:
          RAZORPAY_KEY_ID,

        orderId:
          razorpayOrder.id,

        amount:
          razorpayOrder.amount,

        currency:
          razorpayOrder.currency,

        subscriptionId:
          subscription._id,

        action,

        plan,

        billingCycle,
      });

    } catch (error) {

      console.error(
        "Create subscription order error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to create subscription order.",
      });
    }
  };


// =====================================================
// VERIFY SUBSCRIPTION PAYMENT
// =====================================================

export const verifySubscriptionPayment =
  async (
    req,
    res
  ) => {

    try {

      // -----------------------------------------
      // 1. Firebase authentication
      // -----------------------------------------

      const email =
        req.firebaseUser?.email;

      if (!email) {
        return res.status(401).json({
          message:
            "Authenticated user email not found.",
        });
      }


      // -----------------------------------------
      // 2. Get payment information
      // -----------------------------------------

      const {
        subscriptionId,
        razorpayPaymentId,
        razorpayOrderId,
        razorpaySignature,
      } = req.body;


      if (!subscriptionId) {
        return res.status(400).json({
          message:
            "Subscription ID is required.",
        });
      }

      if (!razorpayPaymentId) {
        return res.status(400).json({
          message:
            "Razorpay payment ID is required.",
        });
      }

      if (!razorpayOrderId) {
        return res.status(400).json({
          message:
            "Razorpay order ID is required.",
        });
      }

      if (!razorpaySignature) {
        return res.status(400).json({
          message:
            "Razorpay signature is required.",
        });
      }


      // -----------------------------------------
      // 3. Find user
      // -----------------------------------------

      const user =
        await users.findOne({
          email,
        });

      if (!user) {
        return res.status(404).json({
          message:
            "User not found.",
        });
      }


      // -----------------------------------------
      // 4. Find subscription transaction
      // -----------------------------------------

      const subscription =
        await subscriptions.findOne({
          _id:
            subscriptionId,

          userId:
            user._id,
        });

      if (!subscription) {
        return res.status(404).json({
          message:
            "Subscription transaction not found.",
        });
      }


      // -----------------------------------------
      // 5. Idempotency check
      // -----------------------------------------

      if (
        subscription.paymentStatus ===
          "paid" &&
        subscription.razorpayPaymentId ===
          razorpayPaymentId
      ) {
        return res.status(200).json({

          message:
            "Payment already verified.",

          subscription,
        });
      }


      // -----------------------------------------
      // 6. Verify order ID
      // -----------------------------------------

      if (
        subscription.razorpayOrderId !==
        razorpayOrderId
      ) {
        return res.status(400).json({
          message:
            "Razorpay order ID does not match.",
        });
      }


      // -----------------------------------------
      // 7. Check Razorpay secret
      // -----------------------------------------

      if (
        !process.env
          .RAZORPAY_KEY_SECRET
      ) {
        console.error(
          "RAZORPAY_KEY_SECRET is missing."
        );

        return res.status(500).json({
          message:
            "Razorpay configuration error.",
        });
      }


      // -----------------------------------------
      // 8. Generate signature
      // -----------------------------------------

      const generatedSignature =
        crypto
          .createHmac(
            "sha256",
            process.env
              .RAZORPAY_KEY_SECRET
          )
          .update(
            `${subscription.razorpayOrderId}|${razorpayPaymentId}`
          )
          .digest("hex");


      // -----------------------------------------
      // 9. Compare signatures safely
      // -----------------------------------------

      if (
        generatedSignature.length !==
        razorpaySignature.length
      ) {
        return res.status(400).json({
          message:
            "Payment signature verification failed.",
        });
      }


      const signaturesMatch =
        crypto.timingSafeEqual(
          Buffer.from(
            generatedSignature
          ),
          Buffer.from(
            razorpaySignature
          )
        );


      if (!signaturesMatch) {
        return res.status(400).json({
          message:
            "Payment signature verification failed.",
        });
      }


      // -----------------------------------------
      // 10. Fetch Razorpay order
      // -----------------------------------------

      const razorpayOrder =
        await razorpay.orders.fetch(
          subscription.razorpayOrderId
        );


      // -----------------------------------------
      // 11. Verify order amount
      // -----------------------------------------

      const expectedAmount =
        Math.round(
          subscription.amount *
            100
        );


      if (
        Number(
          razorpayOrder.amount
        ) !==
        expectedAmount
      ) {
        return res.status(400).json({
          message:
            "Payment amount does not match.",
        });
      }


      // -----------------------------------------
      // 12. Verify order currency
      // -----------------------------------------

      if (
        razorpayOrder.currency !==
        subscription.currency
      ) {
        return res.status(400).json({
          message:
            "Payment currency does not match.",
        });
      }


      // -----------------------------------------
      // 13. Fetch payments
      // -----------------------------------------

      const paymentData =
        await razorpay.orders
          .fetchPayments(
            subscription.razorpayOrderId
          );


      const payment =
        paymentData.items?.find(
          (item) =>
            item.id ===
            razorpayPaymentId
        );


      if (!payment) {
        return res.status(400).json({
          message:
            "Payment transaction not found.",
        });
      }


      // -----------------------------------------
      // 14. Verify payment amount
      // -----------------------------------------

      if (
        Number(payment.amount) !==
        expectedAmount
      ) {
        return res.status(400).json({
          message:
            "Payment amount verification failed.",
        });
      }


      // -----------------------------------------
      // 15. Verify payment currency
      // -----------------------------------------

      if (
        payment.currency !==
        subscription.currency
      ) {
        return res.status(400).json({
          message:
            "Payment currency verification failed.",
        });
      }


      // -----------------------------------------
      // 16. Payment must be captured
      // -----------------------------------------

      if (
        payment.status !==
        "captured"
      ) {
        return res.status(400).json({
          message:
            "Payment has not been captured.",
        });
      }


      // -----------------------------------------
      // 17. Calculate subscription dates
      // -----------------------------------------

      const now =
        new Date();

      let subscriptionStartDate =
        now;

      let subscriptionExpiryDate;


      // -----------------------------------------
      // Renewal
      // -----------------------------------------

      if (
        subscription.action ===
          "renewal" &&
        user.subscriptionPlan ===
          subscription.plan &&
        user.subscriptionExpiresAt &&
        new Date(
          user.subscriptionExpiresAt
        ) > now
      ) {

        subscriptionStartDate =
          new Date(
            user.subscriptionExpiresAt
          );

        const duration =
          getDurationInDays(
            subscription.billingCycle
          );

        subscriptionExpiryDate =
          new Date(
            subscriptionStartDate.getTime() +
              duration *
                24 *
                60 *
                60 *
                1000
          );

      }

      // -----------------------------------------
      // Purchase / upgrade / downgrade
      // -----------------------------------------

      else {

        const duration =
          getDurationInDays(
            subscription.billingCycle
          );

        subscriptionExpiryDate =
          new Date(
            now.getTime() +
              duration *
                24 *
                60 *
                60 *
                1000
          );
      }


      // -----------------------------------------
      // 18. Next renewal date
      // -----------------------------------------

      const nextRenewalDate =
        subscriptionExpiryDate;


      // -----------------------------------------
      // 19. Invoice number
      // -----------------------------------------

      let invoiceNumber =
        generateInvoiceNumber();


      // -----------------------------------------
      // 20. Make invoice unique
      // -----------------------------------------

      while (
        await subscriptions.exists({
          invoiceNumber,
        })
      ) {
        invoiceNumber =
          generateInvoiceNumber();
      }


      // -----------------------------------------
      // 21. Payment method
      // -----------------------------------------

      const paymentMethod =
        payment.method ||
        null;


      // -----------------------------------------
      // 22. Update subscription transaction
      // -----------------------------------------

      subscription.paymentStatus =
        "paid";

      subscription.razorpayPaymentId =
        razorpayPaymentId;

      subscription.razorpaySignature =
        razorpaySignature;

      subscription.invoiceNumber =
        invoiceNumber;

      subscription.paymentReceipt =
        payment.acquirer_data
          ?.bank_transaction_id ||
        payment.id ||
        null;

      subscription.subscriptionStartDate =
        subscriptionStartDate;

      subscription.subscriptionExpiryDate =
        subscriptionExpiryDate;

      subscription.nextRenewalDate =
        nextRenewalDate;

      subscription.paidAt =
        new Date(
          payment.created_at
            ? payment.created_at * 1000
            : Date.now()
        );

      subscription.paymentMethod =
        paymentMethod;


      await subscription.save();


      // -----------------------------------------
      // 23. Update user's subscription
      // -----------------------------------------

      user.subscriptionPlan =
        subscription.plan;

      user.subscriptionExpiresAt =
        subscriptionExpiryDate;


      await user.save();


      // -----------------------------------------
      // 24. Send confirmation email
      // -----------------------------------------

      let emailSent =
        false;

      try {

        await sendSubscriptionConfirmationEmail({
          email:
            user.email,

          name:
            user.name,

          plan:
            subscription.plan,

          billingCycle:
            subscription.billingCycle,

          amount:
            subscription.amount,

          currency:
            subscription.currency,

          paymentId:
            subscription.razorpayPaymentId,

          orderId:
            subscription.razorpayOrderId,

          invoiceNumber:
            subscription.invoiceNumber,

          paymentStatus:
            subscription.paymentStatus,

          startDate:
            subscription.subscriptionStartDate,

          expiryDate:
            subscription.subscriptionExpiryDate,

          supportEmail:
            process.env.SUPPORT_EMAIL,
        });

        emailSent =
          true;

      } catch (emailError) {

        console.error(
          "Subscription confirmation email failed:",
          emailError
        );

        // -----------------------------------------
        // Email failure does NOT affect payment
        // or subscription activation.
        // -----------------------------------------

        emailSent =
          false;
      }


      // -----------------------------------------
      // 25. Return success
      // -----------------------------------------

      return res.status(200).json({

        message:
          "Payment verified and subscription activated successfully.",

        emailSent,

        subscription: {

          _id:
            subscription._id,

          plan:
            subscription.plan,

          billingCycle:
            subscription.billingCycle,

          amount:
            subscription.amount,

          currency:
            subscription.currency,

          paymentStatus:
            subscription.paymentStatus,

          action:
            subscription.action,

          invoiceNumber:
            subscription.invoiceNumber,

          subscriptionStartDate:
            subscription.subscriptionStartDate,

          subscriptionExpiryDate:
            subscription.subscriptionExpiryDate,

          nextRenewalDate:
            subscription.nextRenewalDate,

          paidAt:
            subscription.paidAt,
        },
      });

    } catch (error) {

      console.error(
        "Verify subscription payment error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to verify subscription payment.",
      });
    }
  };


// =====================================================
// CREATE RENEWAL ORDER
// =====================================================

export const createRenewalOrder =
  async (
    req,
    res
  ) => {

    try {

      // -----------------------------------------
      // 1. Get Firebase user's email
      // -----------------------------------------

      const email =
        req.firebaseUser?.email;

      if (!email) {
        return res.status(401).json({
          message:
            "Authenticated user email not found.",
        });
      }


      // -----------------------------------------
      // 2. Get billing cycle
      // -----------------------------------------

      const {
        billingCycle,
      } = req.body;

      if (!billingCycle) {
        return res.status(400).json({
          message:
            "Billing cycle is required.",
        });
      }


      // -----------------------------------------
      // 3. Find user
      // -----------------------------------------

      const user =
        await users.findOne({
          email,
        });

      if (!user) {
        return res.status(404).json({
          message:
            "User not found.",
        });
      }


      // -----------------------------------------
      // 4. Current plan
      // -----------------------------------------

      const currentPlan =
        user.subscriptionPlan ||
        "Free";


      // -----------------------------------------
      // 5. Free cannot renew
      // -----------------------------------------

      if (
        currentPlan === "Free"
      ) {
        return res.status(400).json({
          message:
            "Free plan does not require renewal.",
        });
      }


      // -----------------------------------------
      // 6. Check plan
      // -----------------------------------------

      const selectedPlan =
        SUBSCRIPTION_PLANS[
          currentPlan
        ];

      if (!selectedPlan) {
        return res.status(400).json({
          message:
            "Current subscription plan is invalid.",
        });
      }


      // -----------------------------------------
      // 7. Validate billing cycle
      // -----------------------------------------

      if (
        !selectedPlan.price ||
        selectedPlan.price[
          billingCycle
        ] === undefined
      ) {
        return res.status(400).json({
          message:
            "Invalid billing cycle.",
        });
      }


      // -----------------------------------------
      // 8. Get amount
      // -----------------------------------------

      const amount =
        selectedPlan.price[
          billingCycle
        ];

      if (
        typeof amount !==
          "number" ||
        amount <= 0
      ) {
        return res.status(400).json({
          message:
            "Invalid subscription amount.",
        });
      }


      // -----------------------------------------
      // 9. Create Razorpay order
      // -----------------------------------------

      const razorpayOrder =
        await razorpay.orders.create({
          amount:
            amount * 100,

          currency:
            "INR",

          receipt:
            `renew_${Date.now()}`,

          notes: {
            userId:
              user._id.toString(),

            plan:
              currentPlan,

            billingCycle,

            action:
              "renewal",
          },
        });


      // -----------------------------------------
      // 10. Save renewal transaction
      // -----------------------------------------

      const subscription =
        await subscriptions.create({
          userId:
            user._id,

          plan:
            currentPlan,

          billingCycle,

          amount,

          currency:
            "INR",

          razorpayOrderId:
            razorpayOrder.id,

          paymentStatus:
            "created",

          action:
            "renewal",

          isRenewal:
            true,

          previousSubscriptionId:
            null,

          autoRenew:
            false,
        });


      // -----------------------------------------
      // 11. Return order information
      // -----------------------------------------

      return res.status(201).json({

        message:
          "Renewal order created successfully.",

        keyId:
          RAZORPAY_KEY_ID,

        orderId:
          razorpayOrder.id,

        amount:
          razorpayOrder.amount,

        currency:
          razorpayOrder.currency,

        subscriptionId:
          subscription._id,

        action:
          "renewal",

        plan:
          currentPlan,

        billingCycle,
      });

    } catch (error) {

      console.error(
        "Create renewal order error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to create renewal order.",
      });
    }
  };


// =====================================================
// CANCEL SUBSCRIPTION
// =====================================================

export const cancelSubscription =
  async (
    req,
    res
  ) => {

    try {

      // -----------------------------------------
      // 1. Get Firebase user's email
      // -----------------------------------------

      const email =
        req.firebaseUser?.email;

      if (!email) {
        return res.status(401).json({
          message:
            "Authenticated user email not found.",
        });
      }


      // -----------------------------------------
      // 2. Get cancellation reason
      // -----------------------------------------

      const {
        cancellationReason,
      } = req.body;


      // -----------------------------------------
      // 3. Find user
      // -----------------------------------------

      const user =
        await users.findOne({
          email,
        });

      if (!user) {
        return res.status(404).json({
          message:
            "User not found.",
        });
      }


      // -----------------------------------------
      // 4. Check current subscription
      // -----------------------------------------

      const currentPlan =
        user.subscriptionPlan ||
        "Free";

      const currentExpiry =
        user.subscriptionExpiresAt ||
        null;


      if (
        currentPlan === "Free"
      ) {
        return res.status(400).json({
          message:
            "Free plan cannot be cancelled.",
        });
      }


      // -----------------------------------------
      // 5. Check expiry
      // -----------------------------------------

      if (
        !currentExpiry ||
        new Date(
          currentExpiry
        ) <= new Date()
      ) {
        return res.status(400).json({
          message:
            "Your subscription has already expired.",
        });
      }


      // -----------------------------------------
      // 6. Find active paid subscription
      // -----------------------------------------

      const currentSubscription =
        await subscriptions
          .findOne({
            userId:
              user._id,

            paymentStatus:
              "paid",

            subscriptionExpiryDate: {
              $gt:
                new Date(),
            },
          })
          .sort({
            createdAt:
              -1,
          });


      if (!currentSubscription) {
        return res.status(404).json({
          message:
            "Active subscription transaction not found.",
        });
      }


      // -----------------------------------------
      // 7. Prevent duplicate cancellation
      // -----------------------------------------

      const alreadyCancelled =
        await subscriptions.findOne({
          userId:
            user._id,

          action:
            "cancel",

          paymentStatus:
            "cancelled",

          previousSubscriptionId:
            currentSubscription._id,
        });


      if (alreadyCancelled) {
        return res.status(400).json({
          message:
            "Your subscription is already cancelled.",
        });
      }


      // -----------------------------------------
      // 8. Disable auto renewal
      // -----------------------------------------

      currentSubscription.autoRenew =
        false;

      await currentSubscription.save();


      // -----------------------------------------
      // 9. Create cancellation record
      // -----------------------------------------

      const cancellation =
        await subscriptions.create({

          userId:
            user._id,

          plan:
            currentPlan,

          billingCycle:
            currentSubscription
              .billingCycle,

          amount:
            0,

          currency:
            "INR",

          razorpayOrderId:
            null,

          razorpayPaymentId:
            null,

          razorpaySignature:
            null,

          paymentStatus:
            "cancelled",

          subscriptionStartDate:
            currentSubscription
              .subscriptionStartDate,

          subscriptionExpiryDate:
            currentSubscription
              .subscriptionExpiryDate,

          nextRenewalDate:
            null,

          isRenewal:
            false,

          previousSubscriptionId:
            currentSubscription._id,

          autoRenew:
            false,

          action:
            "cancel",

          cancelledAt:
            new Date(),

          cancellationReason:
            cancellationReason ||
            "Subscription cancelled by user.",
        });


      // -----------------------------------------
      // 10. Keep current plan until expiry
      // -----------------------------------------

      user.subscriptionPlan =
        currentPlan;

      user.subscriptionExpiresAt =
        currentExpiry;

      await user.save();


      // -----------------------------------------
      // 11. Return success
      // -----------------------------------------

      return res.status(200).json({

        message:
          "Subscription cancelled successfully. Your current access will continue until the expiry date.",

        cancellation: {

          id:
            cancellation._id,

          plan:
            cancellation.plan,

          action:
            cancellation.action,

          paymentStatus:
            cancellation.paymentStatus,

          cancelledAt:
            cancellation.cancelledAt,

          cancellationReason:
            cancellation.cancellationReason,

          subscriptionExpiryDate:
            cancellation
              .subscriptionExpiryDate,
        },
      });

    } catch (error) {

      console.error(
        "Cancel subscription error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to cancel subscription.",
      });
    }
  };


// =====================================================
// GET CURRENT SUBSCRIPTION DETAILS
// =====================================================

export const getSubscriptionDetails =
  async (
    req,
    res
  ) => {

    try {

      // -----------------------------------------
      // 1. Get Firebase user's email
      // -----------------------------------------

      const email =
        req.firebaseUser?.email;

      if (!email) {
        return res.status(401).json({
          message:
            "Authenticated user email not found.",
        });
      }


      // -----------------------------------------
      // 2. Find user
      // -----------------------------------------

      const user =
        await users.findOne({
          email,
        });

      if (!user) {
        return res.status(404).json({
          message:
            "User not found.",
        });
      }


      // -----------------------------------------
      // 3. Automatically downgrade expired plan
      // -----------------------------------------

      await autoDowngradeExpiredSubscription(
        user
      );


      // -----------------------------------------
      // 4. Get current plan
      // -----------------------------------------

      const currentPlan =
        user.subscriptionPlan ||
        "Free";

      const expiryDate =
        user.subscriptionExpiresAt ||
        null;


      // -----------------------------------------
      // 5. Calculate status
      // -----------------------------------------

      let status =
        "Active";

      let remainingDays =
        null;


      if (
        currentPlan !== "Free" &&
        expiryDate
      ) {

        const now =
          new Date();

        const expiry =
          new Date(
            expiryDate
          );


        if (
          expiry <= now
        ) {

          status =
            "Expired";

          remainingDays =
            0;

        } else {

          const difference =
            expiry.getTime() -
            now.getTime();

          remainingDays =
            Math.ceil(
              difference /
                (
                  1000 *
                  60 *
                  60 *
                  24
                )
            );
        }
      }


      // -----------------------------------------
      // 6. Get latest paid subscription
      // -----------------------------------------

      const latestSubscription =
        await subscriptions
          .findOne({
            userId:
              user._id,

            paymentStatus:
              "paid",
          })
          .sort({
            createdAt:
              -1,
          });


      // -----------------------------------------
      // 7. Return details
      // -----------------------------------------

      return res.status(200).json({

        subscription: {

          plan:
            currentPlan,

          status,

          startDate:
            latestSubscription
              ?.subscriptionStartDate ||
            null,

          expiryDate,

          remainingDays,

          nextRenewalDate:
            latestSubscription
              ?.nextRenewalDate ||
            null,

          autoRenew:
            latestSubscription
              ?.autoRenew ||
            false,
        },

        latestPayment:
          latestSubscription
            ? {

                plan:
                  latestSubscription
                    .plan,

                billingCycle:
                  latestSubscription
                    .billingCycle,

                amount:
                  latestSubscription
                    .amount,

                currency:
                  latestSubscription
                    .currency,

                paymentStatus:
                  latestSubscription
                    .paymentStatus,

                razorpayOrderId:
                  latestSubscription
                    .razorpayOrderId,

                razorpayPaymentId:
                  latestSubscription
                    .razorpayPaymentId,

                invoiceNumber:
                  latestSubscription
                    .invoiceNumber,

                paidAt:
                  latestSubscription
                    .paidAt,
              }
            : null,
      });

    } catch (error) {

      console.error(
        "Get subscription details error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to fetch subscription details.",
      });
    }
  };


// =====================================================
// GET BILLING HISTORY
// =====================================================

export const getBillingHistory =
  async (
    req,
    res
  ) => {

    try {

      // -----------------------------------------
      // 1. Get Firebase user's email
      // -----------------------------------------

      const email =
        req.firebaseUser?.email;

      if (!email) {
        return res.status(401).json({
          message:
            "Authenticated user email not found.",
        });
      }


      // -----------------------------------------
      // 2. Find user
      // -----------------------------------------

      const user =
        await users.findOne({
          email,
        });

      if (!user) {
        return res.status(404).json({
          message:
            "User not found.",
        });
      }


      // -----------------------------------------
      // 3. Get billing history
      // -----------------------------------------

      const billingHistory =
        await subscriptions
          .find({
            userId:
              user._id,
          })
          .sort({
            createdAt:
              -1,
          });


      // -----------------------------------------
      // 4. Format billing history
      // -----------------------------------------

      const history =
        billingHistory.map(
          (subscription) => ({

            id:
              subscription._id,

            plan:
              subscription.plan,

            billingCycle:
              subscription.billingCycle,

            amount:
              subscription.amount,

            currency:
              subscription.currency,

            paymentStatus:
              subscription.paymentStatus,

            action:
              subscription.action,

            razorpayOrderId:
              subscription
                .razorpayOrderId ||
              null,

            razorpayPaymentId:
              subscription
                .razorpayPaymentId ||
              null,

            invoiceNumber:
              subscription
                .invoiceNumber ||
              null,

            paymentReceipt:
              subscription
                .paymentReceipt ||
              null,

            paymentMethod:
              subscription
                .paymentMethod ||
              null,

            subscriptionStartDate:
              subscription
                .subscriptionStartDate ||
              null,

            subscriptionExpiryDate:
              subscription
                .subscriptionExpiryDate ||
              null,

            nextRenewalDate:
              subscription
                .nextRenewalDate ||
              null,

            autoRenew:
              subscription.autoRenew,

            isRenewal:
              subscription.isRenewal,

            paidAt:
              subscription.paidAt ||
              null,

            cancelledAt:
              subscription.cancelledAt ||
              null,

            cancellationReason:
              subscription
                .cancellationReason ||
              null,

            failureReason:
              subscription
                .failureReason ||
              null,

            createdAt:
              subscription.createdAt,

            updatedAt:
              subscription.updatedAt,
          })
        );


      // -----------------------------------------
      // 5. Return billing history
      // -----------------------------------------

      return res.status(200).json({
        billingHistory:
          history,
      });

    } catch (error) {

      console.error(
        "Get billing history error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to fetch billing history.",
      });
    }
  };

  // =====================================================
// GET INVOICE
// =====================================================

export const getInvoice = async (
  req,
  res
) => {
  try {
    // -----------------------------------------
    // 1. Get Firebase user's email
    // -----------------------------------------

    const email =
      req.firebaseUser?.email;

    if (!email) {
      return res.status(401).json({
        message:
          "Authenticated user email not found.",
      });
    }

    // -----------------------------------------
    // 2. Get invoice ID
    // -----------------------------------------

    const { invoiceId } = req.params;

    if (!invoiceId) {
      return res.status(400).json({
        message:
          "Invoice ID is required.",
      });
    }

    // -----------------------------------------
    // 3. Find user
    // -----------------------------------------

    const user =
      await users.findOne({
        email,
      });

    if (!user) {
      return res.status(404).json({
        message:
          "User not found.",
      });
    }

    // -----------------------------------------
    // 4. Find paid subscription
    // -----------------------------------------

    const subscription =
      await subscriptions.findOne({
        _id: invoiceId,

        userId:
          user._id,

        paymentStatus:
          "paid",
      });

    if (!subscription) {
      return res.status(404).json({
        message:
          "Paid invoice not found.",
      });
    }

    // -----------------------------------------
    // 5. Return invoice information
    // -----------------------------------------

    return res.status(200).json({
      invoice: {
        id:
          subscription._id,

        invoiceNumber:
          subscription.invoiceNumber,

        plan:
          subscription.plan,

        billingCycle:
          subscription.billingCycle,

        amount:
          subscription.amount,

        currency:
          subscription.currency,

        paymentStatus:
          subscription.paymentStatus,

        paymentMethod:
          subscription.paymentMethod ||
          null,

        razorpayOrderId:
          subscription.razorpayOrderId ||
          null,

        razorpayPaymentId:
          subscription.razorpayPaymentId ||
          null,

        paymentReceipt:
          subscription.paymentReceipt ||
          null,

        subscriptionStartDate:
          subscription.subscriptionStartDate ||
          null,

        subscriptionExpiryDate:
          subscription.subscriptionExpiryDate ||
          null,

        nextRenewalDate:
          subscription.nextRenewalDate ||
          null,

        paidAt:
          subscription.paidAt ||
          null,

        action:
          subscription.action,

        customer: {
          name:
            user.name || "",

          email:
            user.email || "",
        },

        supportEmail:
          process.env.SUPPORT_EMAIL ||
          "",
      },
    });

  } catch (error) {
    console.error(
      "Get invoice error:",
      error
    );

    return res.status(500).json({
      message:
        "Unable to fetch invoice.",
    });
  }
};

// =====================================================

// =====================================================
// RECONCILE CAPTURED SUBSCRIPTION PAYMENT
// =====================================================

const reconcileCapturedSubscriptionPayment =
  async ({
    user,
    subscription,
    payment,
  }) => {
    try {
      // -----------------------------------------
      // 1. Basic payment validation
      // -----------------------------------------

      const expectedAmount =
        Math.round(
          subscription.amount * 100
        );

      if (
        Number(payment.amount) !==
        expectedAmount
      ) {
        return {
          success: false,
          message:
            "Payment amount verification failed.",
        };
      }

      if (
        payment.currency !==
        subscription.currency
      ) {
        return {
          success: false,
          message:
            "Payment currency verification failed.",
        };
      }

      if (
        payment.status !==
        "captured"
      ) {
        return {
          success: false,
          message:
            "Payment has not been captured.",
        };
      }

      // -----------------------------------------
      // 2. Calculate subscription dates
      // -----------------------------------------

      const now =
        new Date();

      let subscriptionStartDate =
        now;

      let subscriptionExpiryDate;

      if (
        subscription.action ===
          "renewal" &&
        user.subscriptionPlan ===
          subscription.plan &&
        user.subscriptionExpiresAt &&
        new Date(
          user.subscriptionExpiresAt
        ) > now
      ) {
        subscriptionStartDate =
          new Date(
            user.subscriptionExpiresAt
          );

        const duration =
          getDurationInDays(
            subscription.billingCycle
          );

        subscriptionExpiryDate =
          new Date(
            subscriptionStartDate.getTime() +
              duration *
                24 *
                60 *
                60 *
                1000
          );
      } else {
        const duration =
          getDurationInDays(
            subscription.billingCycle
          );

        subscriptionExpiryDate =
          new Date(
            now.getTime() +
              duration *
                24 *
                60 *
                60 *
                1000
          );
      }

      // -----------------------------------------
      // 3. Generate invoice number
      // -----------------------------------------

      let invoiceNumber =
        subscription.invoiceNumber ||
        generateInvoiceNumber();

      while (
        await subscriptions.exists({
          invoiceNumber,
          _id: {
            $ne:
              subscription._id,
          },
        })
      ) {
        invoiceNumber =
          generateInvoiceNumber();
      }

      // -----------------------------------------
      // 4. Atomically mark transaction as paid
      // -----------------------------------------
      //
      // Only an unpaid transaction can be recovered.
      // This protects against duplicate recovery calls.
      // -----------------------------------------

      const updatedSubscription =
        await subscriptions.findOneAndUpdate(
          {
            _id:
              subscription._id,

            userId:
              user._id,

            paymentStatus: {
              $in: [
                "created",
                "cancelled",
                "failed",
              ],
            },
          },
          {
            $set: {
              paymentStatus:
                "paid",

              razorpayPaymentId:
                payment.id,

              invoiceNumber,

              paymentReceipt:
                payment.acquirer_data
                  ?.bank_transaction_id ||
                payment.id ||
                null,

              subscriptionStartDate,

              subscriptionExpiryDate,

              nextRenewalDate:
                subscriptionExpiryDate,

              paidAt:
                new Date(
                  payment.created_at
                    ? payment.created_at *
                        1000
                    : Date.now()
                ),

              paymentMethod:
                payment.method ||
                null,

              failureReason:
                null,

              cancellationReason:
                null,

              cancelledAt:
                null,
            },
          },
          {
            new: true,
          }
        );

      // -----------------------------------------
      // 5. Another process already activated it
      // -----------------------------------------

      if (!updatedSubscription) {
        const latestSubscription =
          await subscriptions.findById(
            subscription._id
          );

        if (
          latestSubscription?.paymentStatus ===
          "paid"
        ) {
          return {
            success: true,
            alreadyProcessed: true,
            subscription:
              latestSubscription,
          };
        }

        return {
          success: false,
          message:
            "Payment could not be reconciled because the transaction was changed by another process.",
        };
      }

      // -----------------------------------------
      // 6. Update user's subscription
      // -----------------------------------------

      user.subscriptionPlan =
        updatedSubscription.plan;

      user.subscriptionExpiresAt =
        updatedSubscription
          .subscriptionExpiryDate;

      await user.save();

      // -----------------------------------------
      // 7. Send confirmation email
      // -----------------------------------------

      let emailSent =
        false;

      try {
        await sendSubscriptionConfirmationEmail({
          email:
            user.email,

          name:
            user.name,

          plan:
            updatedSubscription.plan,

          billingCycle:
            updatedSubscription
              .billingCycle,

          amount:
            updatedSubscription.amount,

          currency:
            updatedSubscription.currency,

          paymentId:
            updatedSubscription
              .razorpayPaymentId,

          orderId:
            updatedSubscription
              .razorpayOrderId,

          invoiceNumber:
            updatedSubscription
              .invoiceNumber,

          paymentStatus:
            updatedSubscription
              .paymentStatus,

          startDate:
            updatedSubscription
              .subscriptionStartDate,

          expiryDate:
            updatedSubscription
              .subscriptionExpiryDate,

          supportEmail:
            process.env.SUPPORT_EMAIL,
        });

        emailSent = true;

      } catch (emailError) {
        console.error(
          "Payment recovery confirmation email failed:",
          emailError
        );
      }

      // -----------------------------------------
      // 8. Return recovered subscription
      // -----------------------------------------

      return {
        success: true,

        alreadyProcessed: false,

        emailSent,

        subscription:
          updatedSubscription,
      };

    } catch (error) {
      console.error(
        "Reconcile captured subscription payment error:",
        error
      );

      return {
        success: false,
        message:
          "Unable to reconcile captured subscription payment.",
      };
    }
  };

// =====================================================
// RECONCILE PAYMENT STATUS
// =====================================================

export const reconcilePaymentStatus = async (
  req,
  res
) => {
  try {
    // -----------------------------------------
    // 1. Firebase authentication
    // -----------------------------------------

    const email =
      req.firebaseUser?.email;

    if (!email) {
      return res.status(401).json({
        message:
          "Authenticated user email not found.",
      });
    }

    // -----------------------------------------
    // 2. Get subscription ID
    // -----------------------------------------

    const {
      subscriptionId,
    } = req.params;

    if (!subscriptionId) {
      return res.status(400).json({
        message:
          "Subscription ID is required.",
      });
    }

    // -----------------------------------------
    // 3. Find user
    // -----------------------------------------

    const user =
      await users.findOne({
        email,
      });

    if (!user) {
      return res.status(404).json({
        message:
          "User not found.",
      });
    }

    // -----------------------------------------
    // 4. Find subscription
    // -----------------------------------------

    const subscription =
      await subscriptions.findOne({
        _id:
          subscriptionId,

        userId:
          user._id,
      });

    if (!subscription) {
      return res.status(404).json({
        message:
          "Subscription transaction not found.",
      });
    }

    // -----------------------------------------
    // 5. Already paid
    // -----------------------------------------

    if (
      subscription.paymentStatus ===
      "paid"
    ) {
      return res.status(200).json({
        recovered: true,

        alreadyProcessed:
          true,

        paymentStatus:
          "paid",

        subscription: {
          id:
            subscription._id,

          plan:
            subscription.plan,

          billingCycle:
            subscription.billingCycle,

          amount:
            subscription.amount,

          currency:
            subscription.currency,

          invoiceNumber:
            subscription.invoiceNumber,

          razorpayOrderId:
            subscription.razorpayOrderId,

          razorpayPaymentId:
            subscription.razorpayPaymentId,

          subscriptionStartDate:
            subscription.subscriptionStartDate,

          subscriptionExpiryDate:
            subscription
              .subscriptionExpiryDate,

          nextRenewalDate:
            subscription
              .nextRenewalDate,
        },
      });
    }

    // -----------------------------------------
    // 6. Check Razorpay order ID
    // -----------------------------------------

    if (
      !subscription.razorpayOrderId
    ) {
      return res.status(400).json({
        message:
          "Razorpay order ID not found.",
      });
    }

    // -----------------------------------------
    // 7. Fetch Razorpay order
    // -----------------------------------------

    const razorpayOrder =
      await razorpay.orders.fetch(
        subscription
          .razorpayOrderId
      );

    // -----------------------------------------
    // 8. Fetch Razorpay payments
    // -----------------------------------------

    const paymentData =
      await razorpay.orders.fetchPayments(
        subscription
          .razorpayOrderId
      );

    const payments =
      paymentData?.items || [];

    // -----------------------------------------
    // 9. Find latest payment
    // -----------------------------------------

    const latestPayment =
      [...payments].sort(
        (a, b) =>
          (b.created_at || 0) -
          (a.created_at || 0)
      )[0];

    // -----------------------------------------
    // 10. No payment found
    // -----------------------------------------

    if (!latestPayment) {
      return res.status(200).json({
        recovered: false,

        paymentStatus:
          subscription.paymentStatus,

        razorpayOrderStatus:
          razorpayOrder.status,

        message:
          "No payment attempt has been found for this order.",

        subscriptionId:
          subscription._id,

        razorpayOrderId:
          subscription
            .razorpayOrderId,
      });
    }

    // -----------------------------------------
    // 11. Failed payment
    // -----------------------------------------

    if (
      latestPayment.status ===
      "failed"
    ) {
      return res.status(200).json({
        recovered: false,

        paymentStatus:
          "failed",

        razorpayOrderStatus:
          razorpayOrder.status,

        paymentId:
          latestPayment.id,

        message:
          "The latest payment attempt failed.",
      });
    }

    // -----------------------------------------
    // 12. Authorized but not captured
    // -----------------------------------------

    if (
      latestPayment.status !==
      "captured"
    ) {
      return res.status(200).json({
        recovered: false,

        paymentStatus:
          latestPayment.status,

        razorpayOrderStatus:
          razorpayOrder.status,

        paymentId:
          latestPayment.id,

        message:
          "Payment has not been captured yet.",
      });
    }

    // -----------------------------------------
    // 13. Reconcile captured payment
    // -----------------------------------------

    const recovery =
      await reconcileCapturedSubscriptionPayment({
        user,
        subscription,
        payment:
          latestPayment,
      });

    if (!recovery.success) {
      return res.status(400).json({
        recovered: false,

        paymentStatus:
          latestPayment.status,

        razorpayOrderStatus:
          razorpayOrder.status,

        message:
          recovery.message ||
          "Captured payment could not be reconciled.",
      });
    }

    // -----------------------------------------
    // 14. Return recovered payment
    // -----------------------------------------

    const recoveredSubscription =
      recovery.subscription;

    return res.status(200).json({
      recovered: true,

      alreadyProcessed:
        recovery.alreadyProcessed ||
        false,

      paymentStatus:
        "paid",

      razorpayOrderStatus:
        razorpayOrder.status,

      paymentId:
        latestPayment.id,

      paymentMethod:
        latestPayment.method ||
        null,

      amount:
        latestPayment.amount,

      currency:
        latestPayment.currency,

      emailSent:
        recovery.emailSent ||
        false,

      subscription: {
        id:
          recoveredSubscription._id,

        plan:
          recoveredSubscription.plan,

        billingCycle:
          recoveredSubscription
            .billingCycle,

        amount:
          recoveredSubscription.amount,

        currency:
          recoveredSubscription.currency,

        invoiceNumber:
          recoveredSubscription
            .invoiceNumber,

        razorpayOrderId:
          recoveredSubscription
            .razorpayOrderId,

        razorpayPaymentId:
          recoveredSubscription
            .razorpayPaymentId,

        subscriptionStartDate:
          recoveredSubscription
            .subscriptionStartDate,

        subscriptionExpiryDate:
          recoveredSubscription
            .subscriptionExpiryDate,

        nextRenewalDate:
          recoveredSubscription
            .nextRenewalDate,
      },
    });

  } catch (error) {
    console.error(
      "Reconcile payment status error:",
      error
    );

    return res.status(500).json({
      recovered: false,

      message:
        "Unable to reconcile payment status.",
    });
  }
};


// GET PAYMENT STATUS
// =====================================================

export const getPaymentStatus = async (
  req,
  res
) => {
  try {
    // -----------------------------------------
    // 1. Get Firebase user's email
    // -----------------------------------------

    const email =
      req.firebaseUser?.email;

    if (!email) {
      return res.status(401).json({
        message:
          "Authenticated user email not found.",
      });
    }

    // -----------------------------------------
    // 2. Get subscription ID
    // -----------------------------------------

    const { subscriptionId } =
      req.params;

    if (!subscriptionId) {
      return res.status(400).json({
        message:
          "Subscription ID is required.",
      });
    }

    // -----------------------------------------
    // 3. Find user
    // -----------------------------------------

    const user =
      await users.findOne({
        email,
      });

    if (!user) {
      return res.status(404).json({
        message:
          "User not found.",
      });
    }

    // -----------------------------------------
    // 4. Find subscription
    // -----------------------------------------

    const subscription =
      await subscriptions.findOne({
        _id: subscriptionId,
        userId: user._id,
      });

    if (!subscription) {
      return res.status(404).json({
        message:
          "Subscription transaction not found.",
      });
    }

    // -----------------------------------------
    // 5. If already paid locally
    // -----------------------------------------

    if (
      subscription.paymentStatus ===
      "paid"
    ) {
      return res.status(200).json({
        paymentStatus: "paid",

        subscriptionStatus:
          "active",

        subscription: {
          id:
            subscription._id,

          plan:
            subscription.plan,

          billingCycle:
            subscription.billingCycle,

          amount:
            subscription.amount,

          invoiceNumber:
            subscription.invoiceNumber,

          razorpayOrderId:
            subscription.razorpayOrderId,

          razorpayPaymentId:
            subscription.razorpayPaymentId,

          subscriptionStartDate:
            subscription.subscriptionStartDate,

          subscriptionExpiryDate:
            subscription.subscriptionExpiryDate,
        },
      });
    }

    // -----------------------------------------
    // 6. Check Razorpay order ID
    // -----------------------------------------

    if (
      !subscription.razorpayOrderId
    ) {
      return res.status(400).json({
        message:
          "Razorpay order ID not found.",
      });
    }

    // -----------------------------------------
    // 7. Fetch Razorpay order
    // -----------------------------------------

    const razorpayOrder =
      await razorpay.orders.fetch(
        subscription.razorpayOrderId
      );

    // -----------------------------------------
    // 8. Fetch Razorpay payments
    // -----------------------------------------

    const paymentData =
      await razorpay.orders.fetchPayments(
        subscription.razorpayOrderId
      );

    const payments =
      paymentData.items || [];

    // -----------------------------------------
    // 9. No payment found
    // -----------------------------------------

    if (payments.length === 0) {
      return res.status(200).json({
        paymentStatus:
          subscription.paymentStatus,

        razorpayOrderStatus:
          razorpayOrder.status,

        message:
          "No payment attempt has been found for this order.",

        subscriptionId:
          subscription._id,

        razorpayOrderId:
          subscription.razorpayOrderId,
      });
    }

    // -----------------------------------------
    // 10. Get latest payment
    // -----------------------------------------

    const latestPayment =
      [...payments].sort(
        (a, b) =>
          (b.created_at || 0) -
          (a.created_at || 0)
      )[0];

    // -----------------------------------------
    // 11. Return payment status
    // -----------------------------------------

    return res.status(200).json({
      paymentStatus:
        latestPayment.status,

      razorpayOrderStatus:
        razorpayOrder.status,

      paymentId:
        latestPayment.id,

      paymentMethod:
        latestPayment.method ||
        null,

      amount:
        latestPayment.amount,

      currency:
        latestPayment.currency,

      subscriptionId:
        subscription._id,

      razorpayOrderId:
        subscription.razorpayOrderId,
    });

  } catch (error) {
    console.error(
      "Get payment status error:",
      error
    );

    return res.status(500).json({
      message:
        "Unable to fetch payment status.",
    });
  }
};

// =====================================================
// RAZORPAY WEBHOOK
// =====================================================

export const handleRazorpayWebhook = async (
  req,
  res
) => {
  try {
    // -----------------------------------------
    // 1. Get webhook signature
    // -----------------------------------------

    const webhookSignature =
      req.headers["x-razorpay-signature"];

    if (!webhookSignature) {
      return res.status(400).json({
        message:
          "Razorpay webhook signature is missing.",
      });
    }

    // -----------------------------------------
    // 2. Webhook secret must exist
    // -----------------------------------------

    const webhookSecret =
      process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error(
        "RAZORPAY_WEBHOOK_SECRET is missing."
      );

      return res.status(500).json({
        message:
          "Razorpay webhook configuration error.",
      });
    }

    // -----------------------------------------
    // 3. Raw request body is required
    // -----------------------------------------

    const rawBody =
      Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(
            JSON.stringify(req.body)
          );

    // -----------------------------------------
    // 4. Generate webhook signature
    // -----------------------------------------

    const generatedSignature =
      crypto
        .createHmac(
          "sha256",
          webhookSecret
        )
        .update(rawBody)
        .digest("hex");

    // -----------------------------------------
    // 5. Safely compare signatures
    // -----------------------------------------

    if (
      generatedSignature.length !==
      webhookSignature.length
    ) {
      return res.status(400).json({
        message:
          "Invalid Razorpay webhook signature.",
      });
    }

    const signaturesMatch =
      crypto.timingSafeEqual(
        Buffer.from(
          generatedSignature
        ),
        Buffer.from(
          webhookSignature
        )
      );

    if (!signaturesMatch) {
      return res.status(400).json({
        message:
          "Invalid Razorpay webhook signature.",
      });
    }

    // -----------------------------------------
    // 6. Parse webhook body
    // -----------------------------------------

    let webhookData;

    try {
      webhookData =
        JSON.parse(
          rawBody.toString("utf8")
        );
    } catch (parseError) {
      return res.status(400).json({
        message:
          "Invalid Razorpay webhook payload.",
      });
    }

    // -----------------------------------------
    // 7. Get event
    // -----------------------------------------

    const event =
      webhookData?.event;

    console.log(
      "Razorpay webhook received:",
      event
    );

    // -----------------------------------------
    // 8. Handle captured payment
    // -----------------------------------------

    if (
      event === "payment.captured"
    ) {
      const payment =
        webhookData?.payload
          ?.payment
          ?.entity;

      if (!payment) {
        return res.status(400).json({
          message:
            "Payment information is missing from webhook.",
        });
      }

      const razorpayOrderId =
        payment.order_id;

      const razorpayPaymentId =
        payment.id;

      if (
        !razorpayOrderId ||
        !razorpayPaymentId
      ) {
        return res.status(400).json({
          message:
            "Razorpay payment or order ID is missing.",
        });
      }

      // -----------------------------------------
      // Find subscription transaction
      // -----------------------------------------

      const subscription =
        await subscriptions.findOne({
          razorpayOrderId,
        });

      if (!subscription) {
        console.warn(
          "Webhook subscription not found:",
          razorpayOrderId
        );

        // Acknowledge the webhook so Razorpay
        // does not repeatedly retry an unknown order.
        return res.status(200).json({
          message:
            "Webhook received. Subscription transaction not found.",
        });
      }

      // -----------------------------------------
      // Idempotency
      // -----------------------------------------

      if (
        subscription.paymentStatus ===
          "paid" &&
        subscription.razorpayPaymentId ===
          razorpayPaymentId
      ) {
        return res.status(200).json({
          message:
            "Payment webhook already processed.",
        });
      }

      // -----------------------------------------
      // Verify amount
      // -----------------------------------------

      const expectedAmount =
        Math.round(
          subscription.amount *
            100
        );

      if (
        Number(payment.amount) !==
        expectedAmount
      ) {
        console.error(
          "Webhook amount mismatch:",
          {
            expectedAmount,
            actualAmount:
              payment.amount,
          }
        );

        return res.status(400).json({
          message:
            "Webhook payment amount does not match.",
        });
      }

      // -----------------------------------------
      // Verify currency
      // -----------------------------------------

      if (
        payment.currency !==
        subscription.currency
      ) {
        return res.status(400).json({
          message:
            "Webhook payment currency does not match.",
        });
      }

      // -----------------------------------------
      // Payment must be captured
      // -----------------------------------------

      if (
        payment.status !==
        "captured"
      ) {
        return res.status(400).json({
          message:
            "Webhook payment is not captured.",
        });
      }

      // -----------------------------------------
      // Find user
      // -----------------------------------------

      const user =
        await users.findById(
          subscription.userId
        );

      if (!user) {
        return res.status(404).json({
          message:
            "Subscription user not found.",
        });
      }

      // -----------------------------------------
      // Calculate subscription dates
      // -----------------------------------------

      const now =
        new Date();

      let subscriptionStartDate =
        now;

      let subscriptionExpiryDate;

      // -----------------------------------------
      // Renewal
      // -----------------------------------------

      if (
        subscription.action ===
          "renewal" &&
        user.subscriptionPlan ===
          subscription.plan &&
        user.subscriptionExpiresAt &&
        new Date(
          user.subscriptionExpiresAt
        ) > now
      ) {
        subscriptionStartDate =
          new Date(
            user.subscriptionExpiresAt
          );

        const duration =
          getDurationInDays(
            subscription.billingCycle
          );

        subscriptionExpiryDate =
          new Date(
            subscriptionStartDate.getTime() +
              duration *
                24 *
                60 *
                60 *
                1000
          );
      }

      // -----------------------------------------
      // Purchase / upgrade / downgrade
      // -----------------------------------------

      else {
        const duration =
          getDurationInDays(
            subscription.billingCycle
          );

        subscriptionExpiryDate =
          new Date(
            now.getTime() +
              duration *
                24 *
                60 *
                60 *
                1000
          );
      }

      // -----------------------------------------
      // Generate invoice number
      // -----------------------------------------

      let invoiceNumber =
        subscription.invoiceNumber ||
        generateInvoiceNumber();

      while (
        await subscriptions.exists({
          invoiceNumber,
          _id: {
            $ne:
              subscription._id,
          },
        })
      ) {
        invoiceNumber =
          generateInvoiceNumber();
      }

      // -----------------------------------------
      // Update subscription transaction
      // -----------------------------------------

      subscription.paymentStatus =
        "paid";

      subscription.razorpayPaymentId =
        razorpayPaymentId;

      subscription.invoiceNumber =
        invoiceNumber;

      subscription.paymentReceipt =
        payment.acquirer_data
          ?.bank_transaction_id ||
        payment.id ||
        null;

      subscription.subscriptionStartDate =
        subscriptionStartDate;

      subscription.subscriptionExpiryDate =
        subscriptionExpiryDate;

      subscription.nextRenewalDate =
        subscriptionExpiryDate;

      subscription.paidAt =
        new Date(
          payment.created_at
            ? payment.created_at * 1000
            : Date.now()
        );

      subscription.paymentMethod =
        payment.method ||
        null;

      await subscription.save();

      // -----------------------------------------
      // Update user's active subscription
      // -----------------------------------------

      user.subscriptionPlan =
        subscription.plan;

      user.subscriptionExpiresAt =
        subscriptionExpiryDate;

      await user.save();

      // -----------------------------------------
      // Send confirmation email
      // -----------------------------------------

      try {
        await sendSubscriptionConfirmationEmail({
          email:
            user.email,

          name:
            user.name,

          plan:
            subscription.plan,

          billingCycle:
            subscription.billingCycle,

          amount:
            subscription.amount,

          currency:
            subscription.currency,

          paymentId:
            subscription.razorpayPaymentId,

          orderId:
            subscription.razorpayOrderId,

          invoiceNumber:
            subscription.invoiceNumber,

          paymentStatus:
            subscription.paymentStatus,

          startDate:
            subscription.subscriptionStartDate,

          expiryDate:
            subscription.subscriptionExpiryDate,

          supportEmail:
            process.env.SUPPORT_EMAIL,
        });
      } catch (emailError) {
        console.error(
          "Webhook confirmation email failed:",
          emailError
        );
      }

      // -----------------------------------------
      // Success
      // -----------------------------------------

      return res.status(200).json({
        message:
          "Payment webhook processed successfully.",
      });
    }

    // -----------------------------------------
    // Handle failed payment
    // -----------------------------------------

    if (
      event === "payment.failed"
    ) {
      const payment =
        webhookData?.payload
          ?.payment
          ?.entity;

      if (!payment) {
        return res.status(400).json({
          message:
            "Payment information is missing from webhook.",
        });
      }

      const razorpayOrderId =
        payment.order_id;

      if (!razorpayOrderId) {
        return res.status(400).json({
          message:
            "Razorpay order ID is missing.",
        });
      }

      const subscription =
        await subscriptions.findOne({
          razorpayOrderId,
        });

      if (!subscription) {
        return res.status(200).json({
          message:
            "Webhook received. Subscription transaction not found.",
        });
      }

      // -----------------------------------------
      // Don't overwrite a successful payment
      // -----------------------------------------

      if (
        subscription.paymentStatus ===
        "paid"
      ) {
        return res.status(200).json({
          message:
            "Payment already completed. Failed webhook ignored.",
        });
      }

      // -----------------------------------------
      // Mark payment as failed
      // -----------------------------------------

      subscription.paymentStatus =
        "failed";

      subscription.razorpayPaymentId =
        payment.id ||
        subscription.razorpayPaymentId ||
        null;

      subscription.failureReason =
        payment.error_description ||
        payment.error_reason ||
        "Payment failed.";

      subscription.paymentMethod =
        payment.method ||
        null;

      await subscription.save();

      return res.status(200).json({
        message:
          "Failed payment webhook processed.",
      });
    }

    // -----------------------------------------
    // Ignore unrelated webhook events
    // -----------------------------------------

    return res.status(200).json({
      message:
        "Webhook received.",
    });

  } catch (error) {
    console.error(
      "Razorpay webhook error:",
      error
    );

    return res.status(500).json({
      message:
        "Unable to process Razorpay webhook.",
    });
  }
};

// =====================================================
// CANCEL UNPAID SUBSCRIPTION ORDER
// =====================================================

export const cancelSubscriptionOrder = async (
  req,
  res
) => {
  try {
    // -----------------------------------------
    // 1. Get Firebase user's email
    // -----------------------------------------

    const email =
      req.firebaseUser?.email;

    if (!email) {
      return res.status(401).json({
        message:
          "Authenticated user email not found.",
      });
    }

    // -----------------------------------------
    // 2. Get subscription ID
    // -----------------------------------------

    const {
      subscriptionId,
      cancellationReason,
    } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({
        message:
          "Subscription ID is required.",
      });
    }

    // -----------------------------------------
    // 3. Find user
    // -----------------------------------------

    const user =
      await users.findOne({
        email,
      });

    if (!user) {
      return res.status(404).json({
        message:
          "User not found.",
      });
    }

    // -----------------------------------------
    // 4. Find unpaid subscription order
    // -----------------------------------------

    const subscription =
      await subscriptions.findOne({
        _id: subscriptionId,
        userId: user._id,
      });

    if (!subscription) {
      return res.status(404).json({
        message:
          "Subscription transaction not found.",
      });
    }

    // -----------------------------------------
    // 5. Don't cancel a completed payment
    // -----------------------------------------

    if (
      subscription.paymentStatus ===
      "paid"
    ) {
      return res.status(400).json({
        message:
          "A paid subscription order cannot be cancelled as an unpaid order.",
      });
    }

    // -----------------------------------------
    // 6. Prevent duplicate cancellation
    // -----------------------------------------

    if (
      subscription.paymentStatus ===
      "cancelled"
    ) {
      return res.status(200).json({
        message:
          "Subscription order is already cancelled.",
      });
    }

    // -----------------------------------------
    // 7. Mark order as cancelled
    // -----------------------------------------

    subscription.paymentStatus =
      "cancelled";

    subscription.cancelledAt =
      new Date();

    subscription.cancellationReason =
      cancellationReason ||
      "Payment checkout was closed by the user.";

    await subscription.save();

    // -----------------------------------------
    // 8. Return success
    // -----------------------------------------

    return res.status(200).json({
      message:
        "Subscription payment attempt cancelled successfully.",

      subscription: {
        id:
          subscription._id,

        plan:
          subscription.plan,

        paymentStatus:
          subscription.paymentStatus,

        action:
          subscription.action,

        cancelledAt:
          subscription.cancelledAt,

        cancellationReason:
          subscription.cancellationReason,
      },
    });

  } catch (error) {
    console.error(
      "Cancel subscription order error:",
      error
    );

    return res.status(500).json({
      message:
        "Unable to cancel subscription payment attempt.",
    });
  }
};


// =====================================================
// CLEANUP ABANDONED SUBSCRIPTION ORDERS
// =====================================================

const ABANDONED_SUBSCRIPTION_ORDER_MINUTES =
  15;

export const cleanupAbandonedSubscriptionOrders =
  async () => {
    try {
      const cutoffTime =
        new Date(
          Date.now() -
            ABANDONED_SUBSCRIPTION_ORDER_MINUTES *
              60 *
              1000
        );

      const abandonedSubscriptions =
        await subscriptions.find({
          paymentStatus:
            "created",

          createdAt: {
            $lt: cutoffTime,
          },

          razorpayOrderId: {
            $ne: null,
          },
        });

      if (
        abandonedSubscriptions.length ===
        0
      ) {
        return {
          cancelledCount: 0,
        };
      }

      let cancelledCount =
        0;

      for (
        const subscription of
          abandonedSubscriptions
      ) {
        try {
          if (
            !subscription
              .razorpayOrderId
          ) {
            continue;
          }

          const razorpayOrder =
            await razorpay.orders.fetch(
              subscription
                .razorpayOrderId
            );

          // Never cancel an already paid Razorpay order.
          if (
            razorpayOrder?.status ===
            "paid"
          ) {
            continue;
          }

          const paymentData =
            await razorpay.orders.fetchPayments(
              subscription
                .razorpayOrderId
            );

          const payments =
            paymentData?.items || [];

          const capturedPayment =
            payments.find(
              (payment) =>
                payment.status ===
                "captured"
            );

          // Never cancel an order when a payment was captured.
          if (capturedPayment) {
            continue;
          }

          const updateResult =
            await subscriptions.updateOne(
              {
                _id:
                  subscription._id,

                paymentStatus:
                  "created",
              },
              {
                $set: {
                  paymentStatus:
                    "cancelled",

                  cancelledAt:
                    new Date(),

                  cancellationReason:
                    "Payment order expired without completion.",
                },
              }
            );

          if (
            updateResult.modifiedCount >
            0
          ) {
            cancelledCount += 1;

            console.log(
              "Abandoned subscription order cancelled:",
              subscription._id.toString()
            );
          }

        } catch (orderError) {
          console.error(
            "Unable to inspect abandoned Razorpay order:",
            subscription
              .razorpayOrderId,
            orderError
          );
        }
      }

      console.log(
        `Abandoned subscription cleanup completed. Cancelled: ${cancelledCount}`
      );

      return {
        cancelledCount,
      };

    } catch (error) {
      console.error(
        "Abandoned subscription cleanup error:",
        error
      );

      return {
        cancelledCount: 0,
        error,
      };
    }
  };

