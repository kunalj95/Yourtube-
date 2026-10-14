import React, {
  useEffect,
  useState,
} from "react";

import { useRouter } from "next/router";

import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { Button } from "@/components/ui/button";

const InvoicePage = () => {
  const router = useRouter();

  const {
    firebaseToken,
  } = useUser();

  const [
    invoice,
    setInvoice,
  ] = useState<any>(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  // -----------------------------------------
  // FORMAT DATE
  // -----------------------------------------

  const formatDate = (
    date: string | null
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
  // FETCH INVOICE
  // -----------------------------------------

  useEffect(() => {
    const fetchInvoice = async () => {
      if (!router.isReady) {
        return;
      }

      if (!firebaseToken) {
        return;
      }

      const invoiceId =
        router.query.invoiceId;

      if (
        !invoiceId ||
        Array.isArray(invoiceId)
      ) {
        setError(
          "Invalid invoice ID."
        );

        setLoading(false);

        return;
      }

      try {
        setLoading(true);
        setError("");

        const response =
          await axiosInstance.get(
            `/subscription/invoice/${invoiceId}`,
            {
              headers: {
                Authorization:
                  `Bearer ${firebaseToken}`,
              },
            }
          );

        console.log(
          "Invoice:",
          response.data
        );

        setInvoice(
          response.data?.invoice ||
            null
        );

      } catch (error: any) {
        console.error(
          "Invoice fetch error:",
          error
        );

        setError(
          error?.response?.data?.message ||
            "Unable to load invoice."
        );

      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();

  }, [
    router.isReady,
    router.query.invoiceId,
    firebaseToken,
  ]);

  // -----------------------------------------
  // PRINT INVOICE
  // -----------------------------------------

  const handlePrint = () => {
    window.print();
  };

  // -----------------------------------------
  // LOADING
  // -----------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-sm text-gray-500">
          Loading invoice...
        </p>
      </div>
    );
  }

  // -----------------------------------------
  // ERROR
  // -----------------------------------------

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="text-center">

          <h1 className="text-2xl font-bold">
            Invoice Not Found
          </h1>

          <p className="text-sm text-gray-500 mt-2">
            {error ||
              "Unable to load this invoice."}
          </p>

          <Button
            className="mt-5"
            onClick={() =>
              router.back()
            }
          >
            Go Back
          </Button>

        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">

      {/* -----------------------------------------
          PRINT BUTTON
      ----------------------------------------- */}

      <div className="mx-auto max-w-4xl mb-5 flex justify-end print:hidden">

        <Button
          onClick={handlePrint}
        >
          Print / Save as PDF
        </Button>

      </div>

      {/* -----------------------------------------
          INVOICE
      ----------------------------------------- */}

      <div
        id="invoice"
        className="mx-auto max-w-4xl bg-white border rounded-lg p-8 shadow-sm"
      >

        {/* -----------------------------------------
            HEADER
        ----------------------------------------- */}

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 border-b pb-6">

          <div>

            <h1 className="text-3xl font-bold">
              YourTube
            </h1>

            <p className="text-sm text-gray-500 mt-1">
              Subscription Invoice
            </p>

          </div>

          <div className="sm:text-right">

            <p className="text-sm text-gray-500">
              Invoice Number
            </p>

            <p className="font-semibold mt-1">
              {invoice.invoiceNumber ||
                "Not available"}
            </p>

            <p className="text-sm text-gray-500 mt-3">
              Payment Status
            </p>

            <p className="font-semibold mt-1">
              {invoice.paymentStatus}
            </p>

          </div>

        </div>

        {/* -----------------------------------------
            CUSTOMER + PAYMENT
        ----------------------------------------- */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6 border-b">

          {/* CUSTOMER */}

          <div>

            <h2 className="text-lg font-semibold mb-4">
              Customer
            </h2>

            <p className="text-sm text-gray-500">
              Name
            </p>

            <p className="font-medium mt-1">
              {invoice.customer?.name ||
                "Not available"}
            </p>

            <p className="text-sm text-gray-500 mt-4">
              Email
            </p>

            <p className="font-medium mt-1 break-all">
              {invoice.customer?.email ||
                "Not available"}
            </p>

          </div>

          {/* PAYMENT */}

          <div>

            <h2 className="text-lg font-semibold mb-4">
              Payment
            </h2>

            <p className="text-sm text-gray-500">
              Payment ID
            </p>

            <p className="font-medium mt-1 break-all">
              {invoice.razorpayPaymentId ||
                "Not available"}
            </p>

            <p className="text-sm text-gray-500 mt-4">
              Order ID
            </p>

            <p className="font-medium mt-1 break-all">
              {invoice.razorpayOrderId ||
                "Not available"}
            </p>

            <p className="text-sm text-gray-500 mt-4">
              Payment Method
            </p>

            <p className="font-medium mt-1 capitalize">
              {invoice.paymentMethod ||
                "Not available"}
            </p>

          </div>

        </div>

        {/* -----------------------------------------
            SUBSCRIPTION DETAILS
        ----------------------------------------- */}

        <div className="py-6 border-b">

          <h2 className="text-lg font-semibold mb-5">
            Subscription Details
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

            <div>

              <p className="text-sm text-gray-500">
                Plan
              </p>

              <p className="font-medium mt-1">
                {invoice.plan}
              </p>

            </div>

            <div>

              <p className="text-sm text-gray-500">
                Billing Cycle
              </p>

              <p className="font-medium mt-1 capitalize">
                {invoice.billingCycle}
              </p>

            </div>

            <div>

              <p className="text-sm text-gray-500">
                Subscription Start
              </p>

              <p className="font-medium mt-1">
                {formatDate(
                  invoice.subscriptionStartDate
                )}
              </p>

            </div>

            <div>

              <p className="text-sm text-gray-500">
                Subscription Expiry
              </p>

              <p className="font-medium mt-1">
                {formatDate(
                  invoice.subscriptionExpiryDate
                )}
              </p>

            </div>

            <div>

              <p className="text-sm text-gray-500">
                Next Renewal
              </p>

              <p className="font-medium mt-1">
                {formatDate(
                  invoice.nextRenewalDate
                )}
              </p>

            </div>

            <div>

              <p className="text-sm text-gray-500">
                Paid On
              </p>

              <p className="font-medium mt-1">
                {formatDate(
                  invoice.paidAt
                )}
              </p>

            </div>

          </div>

        </div>

        {/* -----------------------------------------
            AMOUNT
        ----------------------------------------- */}

        <div className="py-6 border-b">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm text-gray-500">
                Total Amount
              </p>

              <p className="text-xs text-gray-500 mt-1">
                {invoice.currency}
              </p>

            </div>

            <p className="text-3xl font-bold">
              {invoice.currency}{" "}
              {invoice.amount}
            </p>

          </div>

        </div>

        {/* -----------------------------------------
            RECEIPT
        ----------------------------------------- */}

        <div className="py-6 border-b">

          <h2 className="text-lg font-semibold mb-4">
            Payment Receipt
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <div>

              <p className="text-sm text-gray-500">
                Receipt
              </p>

              <p className="font-medium mt-1 break-all">
                {invoice.paymentReceipt ||
                  "Not available"}
              </p>

            </div>

            <div>

              <p className="text-sm text-gray-500">
                Transaction Type
              </p>

              <p className="font-medium mt-1 capitalize">
                {invoice.action ||
                  "purchase"}
              </p>

            </div>

          </div>

        </div>

        {/* -----------------------------------------
            SUPPORT
        ----------------------------------------- */}

        <div className="pt-6">

          <p className="text-sm text-gray-500">
            Need help with your payment or
            subscription?
          </p>

          <p className="text-sm font-medium mt-1">
            Contact:{" "}
            {invoice.supportEmail ||
              "Support"}
          </p>

          <p className="text-xs text-gray-400 mt-5">
            Thank you for subscribing to
            YourTube.
          </p>

        </div>

      </div>

      {/* -----------------------------------------
          PRINT STYLES
      ----------------------------------------- */}

      <style jsx>{`
        @media print {
          body {
            background: white !important;
          }

          #invoice {
            border: none !important;
            box-shadow: none !important;
            max-width: none !important;
            margin: 0 !important;
          }

          @page {
            margin: 15mm;
          }
        }
      `}</style>

    </div>
  );
};

export default InvoicePage;