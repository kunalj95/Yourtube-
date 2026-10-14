import express from "express";

import {
  createSubscriptionOrder,
  verifySubscriptionPayment,
  getSubscriptionDetails,
  getBillingHistory,
  createRenewalOrder,
  cancelSubscription,
  getInvoice,
  getPaymentStatus,
  handleRazorpayWebhook,
  cancelSubscriptionOrder,
  reconcilePaymentStatus,
} from "../controllers/subscription.js";

import firebaseAuth from "../middleware/firebaseAuth.js";

const routes = express.Router();

// -----------------------------------------
// CREATE SUBSCRIPTION ORDER
// -----------------------------------------

routes.post(
  "/create-order",
  firebaseAuth,
  createSubscriptionOrder
);

// -----------------------------------------
// VERIFY RAZORPAY PAYMENT
// -----------------------------------------

routes.post(
  "/verify-payment",
  firebaseAuth,
  verifySubscriptionPayment
);

// -----------------------------------------
// CREATE RENEWAL ORDER
// -----------------------------------------

routes.post(
  "/renew",
  firebaseAuth,
  createRenewalOrder
);

// -----------------------------------------
// CANCEL ACTIVE SUBSCRIPTION
// -----------------------------------------

routes.post(
  "/cancel",
  firebaseAuth,
  cancelSubscription
);

// -----------------------------------------
// CANCEL UNPAID SUBSCRIPTION ORDER
// -----------------------------------------

routes.post(
  "/cancel-order",
  firebaseAuth,
  cancelSubscriptionOrder
);

// -----------------------------------------
// GET CURRENT SUBSCRIPTION DETAILS
// -----------------------------------------

routes.get(
  "/details",
  firebaseAuth,
  getSubscriptionDetails
);

// -----------------------------------------
// GET BILLING HISTORY
// -----------------------------------------

routes.get(
  "/billing-history",
  firebaseAuth,
  getBillingHistory
);

// -----------------------------------------
// GET INVOICE
// -----------------------------------------

routes.get(
  "/invoice/:invoiceId",
  firebaseAuth,
  getInvoice
);

// -----------------------------------------
// GET PAYMENT STATUS
// -----------------------------------------

routes.get(
  "/payment-status/:subscriptionId",
  firebaseAuth,
  getPaymentStatus
);

// -----------------------------------------
// RECONCILE PAYMENT STATUS
// Used when payment may have succeeded
// but frontend verification was interrupted.
// -----------------------------------------

routes.get(
  "/reconcile-payment/:subscriptionId",
  firebaseAuth,
  reconcilePaymentStatus
);

export default routes;