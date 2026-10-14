import React, {
  useEffect,
  useState,
} from "react";

import axiosInstance from "@/lib/axiosinstance";

import {
  ShieldCheck,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  MapPin,
  Clock,
  RefreshCw,
  LogOut,
} from "lucide-react";

interface LoginHistory {
  _id: string;
  ipAddress: string;
  browserName: string;
  browserVersion: string;
  operatingSystem: string;
  deviceType:
    | "Desktop"
    | "Mobile"
    | "Tablet"
    | "Unknown";
  deviceModel: string;
  city: string;
  state: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  loginAt: string;
  status:
    | "successful"
    | "failed"
    | "otp_required"
    | "otp_verified";
}

interface OtpChallenge {
  _id: string;
  deliveryMethod: string;
  deliveryTarget: string;
  status:
    | "pending"
    | "verified"
    | "failed"
    | "expired";
  attemptCount: number;
  maxAttempts: number;
  browserName: string;
  browserVersion: string;
  operatingSystem: string;
  deviceType:
    | "Desktop"
    | "Mobile"
    | "Tablet"
    | "Unknown";
  deviceModel: string;
  ipAddress: string;
  city: string;
  state: string;
  country: string;
  createdAt: string;
  expiresAt: string;
  verifiedAt: string | null;
  loginHistoryId: string | null;
}

interface TrustedDevice {
  _id: string;
  browserName: string;
  browserVersion: string;
  operatingSystem: string;
  deviceType:
    | "Desktop"
    | "Mobile"
    | "Tablet"
    | "Unknown";
  deviceModel: string;
  lastIpAddress: string;
  lastCity: string;
  lastState: string;
  lastCountry: string;
  trustedAt: string;
  expiresAt: string;
  lastUsedAt: string;
  revokedAt: string | null;
}

interface SecuritySession {
  _id: string;
  loginHistoryId: string | null;
  authenticationMethod:
    | "standard"
    | "otp"
    | "trusted_device";
  browserName: string;
  browserVersion: string;
  operatingSystem: string;
  deviceType:
    | "Desktop"
    | "Mobile"
    | "Tablet"
    | "Unknown";
  deviceModel: string;
  ipAddress: string;
  city: string;
  state: string;
  country: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  isCurrent: boolean;
}

interface SecurityResponse {
  loginHistory: LoginHistory[];
  otpChallenges: OtpChallenge[];
  trustedDevices: TrustedDevice[];
  securitySessions: SecuritySession[];
}

// =====================================================
// HELPERS
// =====================================================

const formatDate = (
  value: string | null
) => {
  if (!value) {
    return "Unknown";
  }

  try {
    return new Intl.DateTimeFormat(
      "en-IN",
      {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      }
    ).format(
      new Date(value)
    );
  } catch {
    return "Unknown";
  }
};

const getDeviceIcon = (
  deviceType: string
) => {
  if (
    deviceType ===
    "Mobile"
  ) {
    return (
      <Smartphone className="h-5 w-5" />
    );
  }

  if (
    deviceType ===
    "Tablet"
  ) {
    return (
      <Tablet className="h-5 w-5" />
    );
  }

  return (
    <Monitor className="h-5 w-5" />
  );
};

const getStatusLabel = (
  status: LoginHistory["status"]
) => {
  switch (status) {
    case "successful":
      return "Successful";

    case "otp_required":
      return "OTP required";

    case "otp_verified":
      return "OTP verified";

    case "failed":
      return "Failed";

    default:
      return status;
  }
};

const getStatusClass = (
  status: LoginHistory["status"]
) => {
  switch (status) {
    case "successful":
    case "otp_verified":
      return "text-green-600 bg-green-50 border-green-200";

    case "otp_required":
      return "text-orange-600 bg-orange-50 border-orange-200";

    case "failed":
      return "text-red-600 bg-red-50 border-red-200";

    default:
      return "text-gray-600 bg-gray-50 border-gray-200";
  }
};

const getOtpStatusClass = (
  status: OtpChallenge["status"]
) => {
  switch (status) {
    case "verified":
      return "text-green-600 bg-green-50 border-green-200";

    case "pending":
      return "text-orange-600 bg-orange-50 border-orange-200";

    case "failed":
      return "text-red-600 bg-red-50 border-red-200";

    case "expired":
      return "text-gray-600 bg-gray-50 border-gray-200";

    default:
      return "text-gray-600 bg-gray-50 border-gray-200";
  }
};

// =====================================================
// SECURITY PAGE
// =====================================================

const Security = () => {
  const [
    securityData,
    setSecurityData,
  ] = useState<SecurityResponse | null>(
    null
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    actionLoading,
    setActionLoading,
  ] = useState<string | null>(
    null
  );

  // =====================================================
  // LOAD SECURITY DATA
  // =====================================================

  const loadSecurityData = async () => {
    try {
      setLoading(true);
      setError("");

      const response =
        await axiosInstance.get(
          "/user/security"
        );

      setSecurityData(
        response.data
      );
    } catch (error: any) {
      console.error(
        "Security page load error:",
        error
      );

      setError(
        error?.response?.data
          ?.message ||
          "Unable to load security information."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSecurityData();
  }, []);

  // =====================================================
  // REVOKE TRUSTED DEVICE
  // =====================================================

  const handleRevokeTrustedDevice =
    async (
      deviceId: string
    ) => {
      const confirmed =
        window.confirm(
          "Are you sure you want to revoke this trusted device?"
        );

      if (!confirmed) {
        return;
      }

      try {
        setActionLoading(
          `device-${deviceId}`
        );

        await axiosInstance.delete(
          `/user/security/trusted-device/${deviceId}`
        );

        await loadSecurityData();
      } catch (error: any) {
        console.error(
          "Revoke trusted device error:",
          error
        );

        window.alert(
          error?.response?.data
            ?.message ||
            "Unable to revoke trusted device."
        );
      } finally {
        setActionLoading(
          null
        );
      }
    };

  // =====================================================
  // REVOKE SECURITY SESSION
  // =====================================================

  const handleRevokeSession =
    async (
      sessionId: string
    ) => {
      const confirmed =
        window.confirm(
          "Are you sure you want to revoke this session?"
        );

      if (!confirmed) {
        return;
      }

      try {
        setActionLoading(
          `session-${sessionId}`
        );

        await axiosInstance.delete(
          `/user/security/session/${sessionId}`
        );

        await loadSecurityData();
      } catch (error: any) {
        console.error(
          "Revoke security session error:",
          error
        );

        window.alert(
          error?.response?.data
            ?.message ||
            "Unable to revoke security session."
        );
      } finally {
        setActionLoading(
          null
        );
      }
    };

  // =====================================================
  // REVOKE ALL OTHER SESSIONS
  // =====================================================

  const handleRevokeAllOtherSessions =
    async () => {
      const confirmed =
        window.confirm(
          "Are you sure you want to sign out all other active sessions?"
        );

      if (!confirmed) {
        return;
      }

      try {
        setActionLoading(
          "all-sessions"
        );

        await axiosInstance.post(
          "/user/security/revoke-other-sessions"
        );

        await loadSecurityData();
      } catch (error: any) {
        console.error(
          "Revoke all other sessions error:",
          error
        );

        window.alert(
          error?.response?.data
            ?.message ||
            "Unable to revoke other sessions."
        );
      } finally {
        setActionLoading(
          null
        );
      }
    };

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <main className="min-h-screen w-full bg-background p-6">
        <div className="mx-auto w-full max-w-6xl">
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="text-sm text-muted-foreground">
              Loading security information...
            </div>
          </div>
        </div>
      </main>
    );
  }

  // =====================================================
  // ERROR
  // =====================================================

  if (error) {
    return (
      <main className="min-h-screen w-full bg-background p-6">
        <div className="mx-auto w-full max-w-6xl">
          <div className="rounded-xl border bg-background p-8 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />

            <h1 className="mt-4 text-xl font-semibold">
              Account security
            </h1>

            <p className="mt-2 text-sm text-destructive">
              {error}
            </p>

            <button
              type="button"
              onClick={
                loadSecurityData
              }
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!securityData) {
    return null;
  }

  // =====================================================
  // ACTIVE DATA
  // =====================================================

  const activeTrustedDevices =
    securityData.trustedDevices.filter(
      (device) =>
        !device.revokedAt &&
        new Date(
          device.expiresAt
        ) > new Date()
    );

  const activeSessions =
    securityData.securitySessions.filter(
      (session) =>
        !session.revokedAt &&
        new Date(
          session.expiresAt
        ) > new Date()
    );

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <main className="min-h-screen w-full bg-background p-6">
      <div className="mx-auto w-full max-w-6xl">

        {/* =================================================
            PAGE HEADER
        ================================================= */}

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>

              <div>
                <h1 className="text-2xl font-semibold">
                  Account security
                </h1>

                <p className="mt-1 text-sm text-muted-foreground">
                  Review your account activity,
                  trusted devices, and active sessions.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={
              loadSecurityData
            }
            className="inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {/* =================================================
            TRUSTED DEVICES
        ================================================= */}

        <section className="mb-6 rounded-xl border bg-background">
          <div className="border-b p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">
                  Trusted devices
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Devices that can sign in without
                  another OTP while their trust period
                  is valid.
                </p>
              </div>

              <span className="rounded-full border px-3 py-1 text-xs font-medium">
                {activeTrustedDevices.length} active
              </span>
            </div>
          </div>

          <div className="divide-y">
            {activeTrustedDevices.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No active trusted devices.
              </div>
            ) : (
              activeTrustedDevices.map(
                (device) => (
                  <div
                    key={
                      device._id
                    }
                    className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="flex gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        {getDeviceIcon(
                          device.deviceType
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium">
                            {device.browserName}
                          </h3>

                          <span className="rounded-full border px-2 py-0.5 text-xs">
                            {device.deviceType}
                          </span>
                        </div>

                        <p className="mt-1 text-sm text-muted-foreground">
                          {device.operatingSystem}
                          {" · "}
                          {device.deviceModel}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Globe className="h-3.5 w-3.5" />
                            {device.lastIpAddress}
                          </span>

                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {device.lastCity},{" "}
                            {device.lastState}
                          </span>

                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            Expires{" "}
                            {formatDate(
                              device.expiresAt
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleRevokeTrustedDevice(
                          device._id
                        )
                      }
                      disabled={
                        actionLoading ===
                        `device-${device._id}`
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <LogOut className="h-4 w-4" />

                      {actionLoading ===
                      `device-${device._id}`
                        ? "Revoking..."
                        : "Revoke"}
                    </button>
                  </div>
                )
              )
            )}
          </div>
        </section>

        {/* =================================================
            ACTIVE SECURITY SESSIONS
        ================================================= */}

        <section className="mb-6 rounded-xl border bg-background">
          <div className="border-b p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  Active security sessions
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Sessions that have successfully passed
                  your login security checks.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  handleRevokeAllOtherSessions
                }
                disabled={
                  actionLoading ===
                  "all-sessions"
                }
                className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionLoading ===
                "all-sessions"
                  ? "Revoking..."
                  : "Sign out other sessions"}
              </button>
            </div>
          </div>

          <div className="divide-y">
            {activeSessions.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No active security sessions.
              </div>
            ) : (
              activeSessions.map(
                (session) => (
                  <div
                    key={
                      session._id
                    }
                    className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="flex gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        {getDeviceIcon(
                          session.deviceType
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium">
                            {session.browserName}
                          </h3>

                          {session.isCurrent && (
                            <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-600">
                              Current session
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-sm text-muted-foreground">
                          {session.operatingSystem}
                          {" · "}
                          {session.deviceType}
                          {" · "}
                          {session.deviceModel}
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          Authentication:{" "}
                          {session.authenticationMethod.replace(
                            "_",
                            " "
                          )}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Globe className="h-3.5 w-3.5" />
                            {session.ipAddress}
                          </span>

                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {session.city},{" "}
                            {session.state}
                          </span>

                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            Last used{" "}
                            {formatDate(
                              session.lastUsedAt
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleRevokeSession(
                          session._id
                        )
                      }
                      disabled={
                        session.isCurrent ||
                        actionLoading ===
                          `session-${session._id}`
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <LogOut className="h-4 w-4" />

                      {session.isCurrent
                        ? "Current session"
                        : actionLoading ===
                            `session-${session._id}`
                          ? "Revoking..."
                          : "Revoke"}
                    </button>
                  </div>
                )
              )
            )}
          </div>
        </section>

        {/* =================================================
            LOGIN HISTORY
        ================================================= */}

        <section className="mb-6 rounded-xl border bg-background">
          <div className="border-b p-5">
            <h2 className="text-lg font-semibold">
              Login history
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Recent account login attempts and their
              security status.
            </p>
          </div>

          <div className="divide-y">
            {securityData.loginHistory.length ===
            0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No login history available.
              </div>
            ) : (
              securityData.loginHistory.map(
                (login) => (
                  <div
                    key={
                      login._id
                    }
                    className="p-5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                          {getDeviceIcon(
                            login.deviceType
                          )}
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-medium">
                              {login.browserName}
                            </h3>

                            <span
                              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusClass(
                                login.status
                              )}`}
                            >
                              {getStatusLabel(
                                login.status
                              )}
                            </span>
                          </div>

                          <p className="mt-1 text-sm text-muted-foreground">
                            {login.browserVersion}
                            {" · "}
                            {login.operatingSystem}
                            {" · "}
                            {login.deviceType}
                            {" · "}
                            {login.deviceModel}
                          </p>

                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Globe className="h-3.5 w-3.5" />
                              {login.ipAddress}
                            </span>

                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {login.city},{" "}
                              {login.state},{" "}
                              {login.country}
                            </span>

                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {formatDate(
                                login.loginAt
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              )
            )}
          </div>
        </section>

        {/* =================================================
            OTP HISTORY
        ================================================= */}

        <section className="mb-6 rounded-xl border bg-background">
          <div className="border-b p-5">
            <h2 className="text-lg font-semibold">
              OTP verification history
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Recent OTP challenges used to secure new
              login environments.
            </p>
          </div>

          <div className="divide-y">
            {securityData.otpChallenges.length ===
            0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No OTP challenges available.
              </div>
            ) : (
              securityData.otpChallenges.map(
                (challenge) => (
                  <div
                    key={
                      challenge._id
                    }
                    className="p-5"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getOtpStatusClass(
                            challenge.status
                          )}`}
                        >
                          {challenge.status}
                        </span>

                        <span className="text-sm font-medium">
                          {challenge.browserName}
                        </span>

                        <span className="text-sm text-muted-foreground">
                          {challenge.operatingSystem}
                          {" · "}
                          {challenge.deviceType}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          Attempts:{" "}
                          {challenge.attemptCount}
                          /
                          {challenge.maxAttempts}
                        </span>

                        <span>
                          Created:{" "}
                          {formatDate(
                            challenge.createdAt
                          )}
                        </span>

                        {challenge.verifiedAt && (
                          <span>
                            Verified:{" "}
                            {formatDate(
                              challenge.verifiedAt
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              )
            )}
          </div>
        </section>

      </div>
    </main>
  );
};

export default Security;