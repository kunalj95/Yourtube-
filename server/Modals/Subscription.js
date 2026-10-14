import mongoose from "mongoose";

const subscriptionSchema = mongoose.Schema(
  {
    // =================================================
    // USER
    // =================================================

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },

    // =================================================
    // SUBSCRIPTION PLAN
    // =================================================

    plan: {
      type: String,
      enum: [
        "Free",
        "Bronze",
        "Silver",
        "Gold",
      ],
      required: true,
    },

    // =================================================
    // BILLING CYCLE
    // =================================================

    billingCycle: {
      type: String,
      enum: [
        "monthly",
        "quarterly",
        "yearly",
      ],
      required: true,
    },

    // =================================================
    // AMOUNT
    // =================================================

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "INR",
    },

    // =================================================
    // RAZORPAY DETAILS
    // =================================================

    razorpayOrderId: {
      type: String,
      index: true,
    },

    razorpayPaymentId: {
      type: String,
      index: true,
    },

    razorpaySignature: {
      type: String,
    },

    // =================================================
    // PAYMENT STATUS
    // =================================================

    paymentStatus: {
      type: String,
      enum: [
        "created",
        "pending",
        "paid",
        "failed",
        "cancelled",
        "refunded",
      ],
      default: "created",
      index: true,
    },

    // =================================================
    // INVOICE
    // =================================================

    invoiceNumber: {
      type: String,
      unique: true,
      sparse: true,
    },

    paymentReceipt: {
      type: String,
    },

    // =================================================
    // SUBSCRIPTION DATES
    // =================================================

    subscriptionStartDate: {
      type: Date,
    },

    subscriptionExpiryDate: {
      type: Date,
    },

    nextRenewalDate: {
      type: Date,
    },

    // =================================================
    // RENEWAL INFORMATION
    // =================================================

    isRenewal: {
      type: Boolean,
      default: false,
    },

    previousSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "subscriptions",
      default: null,
    },

    autoRenew: {
      type: Boolean,
      default: false,
    },

    // =================================================
    // SUBSCRIPTION ACTION
    // =================================================

    action: {
      type: String,
      enum: [
        "purchase",
        "upgrade",
        "downgrade",
        "renewal",
        "cancel",
      ],
      default: "purchase",
    },

    // =================================================
    // CANCELLATION
    // =================================================

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancellationReason: {
      type: String,
    },

    // =================================================
    // PAYMENT FAILURE INFORMATION
    // =================================================

    failureReason: {
      type: String,
    },

    // =================================================
    // PAYMENT METHOD
    // =================================================

    paymentMethod: {
      type: String,
    },

    // =================================================
    // PAYMENT TIMESTAMP
    // =================================================

    paidAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);


// =====================================================
// INDEXES
// =====================================================

// Quickly find a user's billing history
subscriptionSchema.index({
  userId: 1,
  createdAt: -1,
});

// Quickly find Razorpay orders
subscriptionSchema.index({
  razorpayOrderId: 1,
});

// Quickly find Razorpay payments
subscriptionSchema.index({
  razorpayPaymentId: 1,
});


// =====================================================
// EXPORT MODEL
// =====================================================

export default mongoose.model(
  "subscriptions",
  subscriptionSchema
);