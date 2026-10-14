import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import {
  ShieldCheck,
} from "lucide-react";

import { useUser } from "@/lib/AuthContext";

const LoginOtpVerification = () => {
  const {
    otpExpiresAt,
    verifyLoginOtp,
  } = useUser();

  const [otp, setOtp] =
    useState("");

  const [error, setError] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [
    trustDevice,
    setTrustDevice,
  ] = useState(false);

  const [
    secondsRemaining,
    setSecondsRemaining,
  ] = useState(0);

  // =====================================================
  // OTP EXPIRY TIMER
  // =====================================================

  useEffect(() => {
    if (!otpExpiresAt) {
      setSecondsRemaining(0);
      return;
    }

    const updateTimer = () => {
      const remaining =
        Math.max(
          0,
          Math.floor(
            (
              new Date(
                otpExpiresAt
              ).getTime() -
              Date.now()
            ) / 1000
          )
        );

      setSecondsRemaining(
        remaining
      );
    };

    updateTimer();

    const interval =
      setInterval(
        updateTimer,
        1000
      );

    return () => {
      clearInterval(
        interval
      );
    };
  }, [otpExpiresAt]);

  // =====================================================
  // FORMAT TIMER
  // =====================================================

  const formatTime = (
    totalSeconds: number
  ) => {
    const minutes =
      Math.floor(
        totalSeconds / 60
      );

    const seconds =
      totalSeconds % 60;

    return `${String(
      minutes
    ).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;
  };

  // =====================================================
  // OTP INPUT
  // =====================================================

  const handleOtpChange = (
    value: string
  ) => {
    const numericValue =
      value
        .replace(/\D/g, "")
        .slice(0, 6);

    setOtp(
      numericValue
    );

    if (error) {
      setError("");
    }
  };

  // =====================================================
  // VERIFY OTP
  // =====================================================

  const handleSubmit = async (
    event: FormEvent
  ) => {
    event.preventDefault();

    setError("");

    // -----------------------------------------
    // Validate OTP
    // -----------------------------------------

    if (otp.length !== 6) {
      setError(
        "Please enter the 6-digit OTP."
      );

      return;
    }

    // -----------------------------------------
    // Check expiry
    // -----------------------------------------

    if (
      secondsRemaining <= 0
    ) {
      setError(
        "This OTP has expired. Please sign in again."
      );

      return;
    }

    setLoading(true);

    // -----------------------------------------
    // Verify OTP
    // -----------------------------------------

    const result =
      await verifyLoginOtp(
        otp,
        trustDevice
      );

    if (!result.success) {
      setError(
        result.message ||
          "Invalid OTP."
      );
    }

    setLoading(false);
  };

  return (
    <div className="flex w-full items-center justify-center px-4 py-8">

      {/* =================================================
          OTP CARD
      ================================================= */}

      <div className="w-full max-w-md rounded-xl border bg-background p-8 shadow-sm">

        {/* =================================================
            SECURITY ICON
        ================================================= */}

        <div className="mb-5 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
        </div>

        {/* =================================================
            TITLE
        ================================================= */}

        <h1 className="text-center text-2xl font-semibold">
          Verify your login
        </h1>

        {/* =================================================
            DESCRIPTION
        ================================================= */}

        <p className="mt-3 text-center text-sm text-muted-foreground">
          We detected a login from a new
          browser, device, IP address, or
          location.
        </p>

        <p className="mt-2 text-center text-sm text-muted-foreground">
          A 6-digit verification code has
          been sent to your registered email
          address.
        </p>

        {/* =================================================
            OTP FORM
        ================================================= */}

        <form
          onSubmit={
            handleSubmit
          }
          className="mt-6"
        >

          {/* ===============================================
              OTP LABEL
          =============================================== */}

          <label
            htmlFor="login-otp"
            className="mb-2 block text-sm font-medium"
          >
            Enter OTP
          </label>

          {/* ===============================================
              OTP INPUT
          =============================================== */}

          <input
            id="login-otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(event) =>
              handleOtpChange(
                event.target.value
              )
            }
            placeholder="Enter 6-digit OTP"
            disabled={loading}
            className="w-full rounded-md border bg-background px-4 py-3 text-center text-lg tracking-[0.4em] outline-none focus:ring-2 focus:ring-ring"
          />

          {/* ===============================================
              TIMER
          =============================================== */}

          <div className="mt-3 text-center text-sm">
            {secondsRemaining >
            0 ? (
              <span className="text-muted-foreground">
                Code expires in{" "}
                <span className="font-medium text-foreground">
                  {formatTime(
                    secondsRemaining
                  )}
                </span>
              </span>
            ) : (
              <span className="text-destructive">
                OTP expired
              </span>
            )}
          </div>

          {/* ===============================================
              TRUST THIS BROWSER
          =============================================== */}

          <label
            htmlFor="trust-device"
            className="mt-5 flex cursor-pointer items-start gap-3"
          >
            <input
              id="trust-device"
              type="checkbox"
              checked={
                trustDevice
              }
              onChange={(
                event
              ) =>
                setTrustDevice(
                  event.target
                    .checked
                )
              }
              disabled={loading}
              className="mt-1 h-4 w-4 rounded border"
            />

            <span className="text-sm">
              <span className="font-medium">
                Trust this browser
              </span>

              <span className="mt-1 block text-muted-foreground">
                Don't ask for an OTP
                again on this
                browser for 30 days.
              </span>
            </span>
          </label>

          {/* ===============================================
              ERROR MESSAGE
          =============================================== */}

          {error && (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* ===============================================
              VERIFY BUTTON
          =============================================== */}

          <button
            type="submit"
            disabled={
              loading ||
              otp.length !== 6 ||
              secondsRemaining <= 0
            }
            className="mt-6 w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Verifying..."
              : "Verify OTP"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginOtpVerification;