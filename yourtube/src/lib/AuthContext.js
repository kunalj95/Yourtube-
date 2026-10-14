import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";

import {
  useState,
  createContext,
  useEffect,
  useContext,
  useRef,
} from "react";

import {
  provider,
  auth,
} from "./firebase";

import axiosInstance from "./axiosinstance";

const UserContext = createContext(
  /** @type {any} */ (null)
);

const TRUSTED_DEVICE_TOKEN_KEY =
  "yourtube-trusted-device-token";

const SECURITY_SESSION_TOKEN_KEY =
  "yourtube-security-session-token";

export const UserProvider = ({
  children,
}) => {
  const [
    user,
    setUser,
  ] = useState(
    /** @type {any} */ (null)
  );

  const [
    firebaseToken,
    setFirebaseToken,
  ] = useState(
    /** @type {any} */ (null)
  );

  // =====================================================
  // AUTH LOADING
  // =====================================================

  const [
    authLoading,
    setAuthLoading,
  ] = useState(true);

  // =====================================================
  // OTP SECURITY STATE
  // =====================================================

  const [
    otpRequired,
    setOtpRequired,
  ] = useState(false);

  const [
    otpChallengeId,
    setOtpChallengeId,
  ] = useState(null);

  const [
    otpExpiresAt,
    setOtpExpiresAt,
  ] = useState(null);

  const [
    otpLoginHistoryId,
    setOtpLoginHistoryId,
  ] = useState(null);

  // =====================================================
  // AUTH REQUEST CONTROL
  // =====================================================

  const authRequestInProgressRef =
    useRef(false);

  const processedFirebaseUidRef =
    useRef(null);

  // =====================================================
  // APPLY THEME
  // =====================================================

  const applyTheme = (
    theme
  ) => {
    if (
      typeof document ===
      "undefined"
    ) {
      return;
    }

    if (
      theme ===
      "dark"
    ) {
      document.documentElement.classList.add(
        "dark"
      );
    } else {
      document.documentElement.classList.remove(
        "dark"
      );
    }
  };

  // =====================================================
  // LOGIN
  // =====================================================

  const login = (
    userdata
  ) => {
    setUser(
      userdata
    );

    localStorage.setItem(
      "user",
      JSON.stringify(
        userdata
      )
    );

    // -----------------------------------------
    // Apply saved theme
    // -----------------------------------------

    if (
      userdata?.themePreference ===
      "dark"
    ) {
      applyTheme(
        "dark"
      );
    } else if (
      userdata?.themePreference ===
      "light"
    ) {
      applyTheme(
        "light"
      );
    }

    // -----------------------------------------
    // Clear OTP state
    // -----------------------------------------

    setOtpRequired(
      false
    );

    setOtpChallengeId(
      null
    );

    setOtpExpiresAt(
      null
    );

    setOtpLoginHistoryId(
      null
    );
  };

  // =====================================================
  // UPDATE THEME
  // =====================================================

  const updateTheme =
    async (
      theme
    ) => {
      try {
        if (
          !user?._id
        ) {
          console.error(
            "Unable to update theme: user ID is missing."
          );

          return false;
        }

        if (
          ![
            "light",
            "dark",
          ].includes(
            theme
          )
        ) {
          console.error(
            "Invalid theme:",
            theme
          );

          return false;
        }

        // -----------------------------------------
        // Apply immediately
        // -----------------------------------------

        applyTheme(
          theme
        );

        // -----------------------------------------
        // Save to backend
        // -----------------------------------------

        const response =
          await axiosInstance.patch(
            `/user/update/${user._id}`,
            {
              themePreference:
                theme,
            }
          );

        // -----------------------------------------
        // Update local user
        // -----------------------------------------

        const updatedUser =
          response.data;

        setUser(
          updatedUser
        );

        localStorage.setItem(
          "user",
          JSON.stringify(
            updatedUser
          )
        );

        return true;
      } catch (error) {
        console.error(
          "Theme update error:",
          error
        );

        return false;
      }
    };

  // =====================================================
  // TRUSTED DEVICE TOKEN
  // =====================================================

  const saveTrustedDeviceToken =
    (
      token
    ) => {
      if (!token) {
        return;
      }

      const cleanedToken =
        String(
          token
        ).trim();

      if (
        !cleanedToken
      ) {
        return;
      }

      localStorage.setItem(
        TRUSTED_DEVICE_TOKEN_KEY,
        cleanedToken
      );
    };

  const getTrustedDeviceToken =
    () => {
      const token =
        localStorage.getItem(
          TRUSTED_DEVICE_TOKEN_KEY
        );

      if (!token) {
        return null;
      }

      return (
        String(
          token
        ).trim() ||
        null
      );
    };

  // =====================================================
  // SECURITY SESSION TOKEN
  // =====================================================

  const saveSecuritySessionToken =
    (
      token
    ) => {
      if (!token) {
        return;
      }

      const cleanedToken =
        String(
          token
        ).trim();

      if (
        !cleanedToken
      ) {
        return;
      }

      localStorage.setItem(
        SECURITY_SESSION_TOKEN_KEY,
        cleanedToken
      );
    };

  const getSecuritySessionToken =
    () => {
      const token =
        localStorage.getItem(
          SECURITY_SESSION_TOKEN_KEY
        );

      if (!token) {
        return null;
      }

      return (
        String(
          token
        ).trim() ||
        null
      );
    };

  const removeSecuritySessionToken =
    () => {
      localStorage.removeItem(
        SECURITY_SESSION_TOKEN_KEY
      );
    };

  // =====================================================
  // LOGOUT
  // =====================================================

  const logout =
    async () => {
      // -----------------------------------------
      // Revoke server-side security session
      // -----------------------------------------

      try {
        if (
          getSecuritySessionToken()
        ) {
          await axiosInstance.post(
            "/user/revoke-session"
          );
        }
      } catch (error) {
        console.error(
          "Unable to revoke security session:",
          error
        );
      }

      // -----------------------------------------
      // Clear local auth state
      // -----------------------------------------

      setUser(
        null
      );

      setFirebaseToken(
        null
      );

      setOtpRequired(
        false
      );

      setOtpChallengeId(
        null
      );

      setOtpExpiresAt(
        null
      );

      setOtpLoginHistoryId(
        null
      );

      localStorage.removeItem(
        "user"
      );

      // -----------------------------------------
      // Remove security session
      // -----------------------------------------

      removeSecuritySessionToken();

      // -----------------------------------------
      // Reset authentication request tracking
      // -----------------------------------------

      authRequestInProgressRef.current =
        false;

      processedFirebaseUidRef.current =
        null;

      /*
        IMPORTANT:

        Do NOT remove the trusted-device token here.

        The browser remains trusted after logout.
      */

      try {
        await signOut(
          auth
        );
      } catch (error) {
        console.error(
          "Error during sign out:",
          error
        );
      }
    };

  // =====================================================
  // GOOGLE SIGN IN
  // =====================================================

  const handlegooglesignin =
    async () => {
      try {
        /*
          Backend login is handled by
          onAuthStateChanged().
        */

        await signInWithPopup(
          auth,
          provider
        );
      } catch (error) {
        console.error(
          "Google sign-in error:",
          error
        );
      }
    };

  // =====================================================
  // VERIFY LOGIN OTP
  // =====================================================

  const verifyLoginOtp =
    async (
      otp,
      trustDevice = false
    ) => {
      try {
        // -----------------------------------------
        // Firebase token required
        // -----------------------------------------

        if (
          !firebaseToken
        ) {
          return {
            success:
              false,

            message:
              "Authentication session is missing. Please sign in again.",
          };
        }

        // -----------------------------------------
        // Challenge ID required
        // -----------------------------------------

        if (
          !otpChallengeId
        ) {
          return {
            success:
              false,

            message:
              "OTP challenge is missing. Please sign in again.",
          };
        }

        // -----------------------------------------
        // Verify OTP
        // -----------------------------------------

        const response =
          await axiosInstance.post(
            "/user/verify-otp",
            {
              challengeId:
                otpChallengeId,

              otp:
                String(
                  otp
                ),

              trustDevice:
                trustDevice ===
                true,
            },
            {
              headers: {
                Authorization:
                  `Bearer ${firebaseToken}`,
              },
            }
          );

        // -----------------------------------------
        // OTP verified
        // -----------------------------------------

        if (
          response.data?.verified
        ) {
          const security =
            response.data
              ?.security;

          const trustedDevice =
            security
              ?.trustedDevice;

          // -----------------------------------------
          // Save security session
          // -----------------------------------------

          if (
            security
              ?.securitySessionToken
          ) {
            saveSecuritySessionToken(
              security.securitySessionToken
            );
          }

          // -----------------------------------------
          // Save trusted-device token
          // -----------------------------------------

          if (
            trustDevice ===
              true &&
            trustedDevice
              ?.trusted ===
              true &&
            trustedDevice
              ?.trustedDeviceToken
          ) {
            saveTrustedDeviceToken(
              trustedDevice.trustedDeviceToken
            );
          }

          // -----------------------------------------
          // Complete login
          // -----------------------------------------

          login(
            response.data.user
          );

          return {
            success:
              true,

            message:
              response.data.message ||
              "OTP verified successfully.",

            trustedDevice:
              trustedDevice || {
                trusted:
                  false,
              },

            securitySession:
              security
                ?.securitySessionToken
                ? {
                    securitySessionToken:
                      security.securitySessionToken,

                    securitySessionExpiresAt:
                      security.securitySessionExpiresAt ||
                      null,
                  }
                : null,
          };
        }

        return {
          success:
            false,

          message:
            "OTP verification failed.",
        };
      } catch (error) {
        console.error(
          "OTP verification error:",
          error
        );

        return {
          success:
            false,

          message:
            error?.response
              ?.data
              ?.message ||
            "Unable to verify OTP.",

          attemptsRemaining:
            error?.response
              ?.data
              ?.attemptsRemaining,
        };
      }
    };

  // =====================================================
  // FIREBASE AUTH STATE
  // =====================================================

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (
          firebaseuser
        ) => {
          // =================================================
          // NO FIREBASE USER
          // =================================================

          if (
            !firebaseuser
          ) {
            setUser(
              null
            );

            setFirebaseToken(
              null
            );

            setOtpRequired(
              false
            );

            setOtpChallengeId(
              null
            );

            setOtpExpiresAt(
              null
            );

            setOtpLoginHistoryId(
              null
            );

            localStorage.removeItem(
              "user"
            );

            // -----------------------------------------
            // Security session no longer valid
            // -----------------------------------------

            removeSecuritySessionToken();

            // -----------------------------------------
            // Reset auth request tracking
            // -----------------------------------------

            authRequestInProgressRef.current =
              false;

            processedFirebaseUidRef.current =
              null;

            setAuthLoading(
              false
            );

            return;
          }

          // =================================================
          // PREVENT DUPLICATE AUTH REQUESTS
          // =================================================

          if (
            processedFirebaseUidRef.current ===
            firebaseuser.uid
          ) {
            return;
          }

          if (
            authRequestInProgressRef.current
          ) {
            return;
          }

          authRequestInProgressRef.current =
            true;

          try {
            // =================================================
            // GET FIREBASE TOKEN
            // =================================================

            const token =
              await firebaseuser.getIdToken();

            setFirebaseToken(
              token
            );

            // =================================================
            // LOGIN PAYLOAD
            // =================================================

            const payload =
              {
                email:
                  firebaseuser.email,

                name:
                  firebaseuser.displayName,

                image:
                  firebaseuser.photoURL ||
                  "https://github.com/shadcn.png",
              };

            // =================================================
            // GET SAVED TRUSTED DEVICE TOKEN
            // =================================================

            const trustedDeviceToken =
              getTrustedDeviceToken();

            // =================================================
            // REQUEST CONFIG
            // =================================================

            const requestConfig =
              trustedDeviceToken
                ? {
                    headers: {
                      "X-YourTube-Trusted-Device-Token":
                        trustedDeviceToken,
                    },
                  }
                : undefined;

            // =================================================
            // LOGIN REQUEST
            // =================================================

            const response =
              await axiosInstance.post(
                "/user/login",
                payload,
                requestConfig
              );

            const security =
              response.data
                ?.security;

            // =================================================
            // OTP REQUIRED
            // =================================================

            if (
              security
                ?.requiresOtp
            ) {
              /*
                IMPORTANT:

                Any old security session must not remain
                active while the current login is waiting
                for OTP verification.
              */

              removeSecuritySessionToken();

              setUser(
                null
              );

              localStorage.removeItem(
                "user"
              );

              setOtpRequired(
                true
              );

              setOtpChallengeId(
                security
                  .otpChallengeId ||
                null
              );

              setOtpExpiresAt(
                security
                  .otpExpiresAt ||
                null
              );

              setOtpLoginHistoryId(
                security
                  .loginHistoryId ||
                null
              );

              processedFirebaseUidRef.current =
                firebaseuser.uid;

              setAuthLoading(
                false
              );

              return;
            }

            // =================================================
            // SAVE SECURITY SESSION
            // =================================================

            if (
              security
                ?.securitySessionToken
            ) {
              saveSecuritySessionToken(
                security.securitySessionToken
              );
            }

            // =================================================
            // NORMAL / TRUSTED LOGIN
            // =================================================

            login(
              response.data.result
            );

            processedFirebaseUidRef.current =
              firebaseuser.uid;

            setAuthLoading(
              false
            );
          } catch (error) {
            console.error(
              "Authentication error:",
              error
            );

            setUser(
              null
            );

            setFirebaseToken(
              null
            );

            setOtpRequired(
              false
            );

            setOtpChallengeId(
              null
            );

            setOtpExpiresAt(
              null
            );

            setOtpLoginHistoryId(
              null
            );

            localStorage.removeItem(
              "user"
            );

            removeSecuritySessionToken();

            processedFirebaseUidRef.current =
              null;

            setAuthLoading(
              false
            );
          } finally {
            authRequestInProgressRef.current =
              false;
          }
        }
      );

    return () =>
      unsubscribe();
  }, []);

  // =====================================================
  // CONTEXT
  // =====================================================

  return (
    <UserContext.Provider
      value={{
        user,

        login,

        logout,

        handlegooglesignin,

        firebaseToken,

        // -----------------------------------------
        // Theme
        // -----------------------------------------

        updateTheme,

        // -----------------------------------------
        // Auth
        // -----------------------------------------

        authLoading,

        // -----------------------------------------
        // OTP
        // -----------------------------------------

        otpRequired,

        otpChallengeId,

        otpExpiresAt,

        otpLoginHistoryId,

        verifyLoginOtp,

        // -----------------------------------------
        // Trusted device
        // -----------------------------------------

        getTrustedDeviceToken,

        // -----------------------------------------
        // Security session
        // -----------------------------------------

        getSecuritySessionToken,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

// =====================================================
// USE USER
// =====================================================

export const useUser = () =>
  useContext(
    UserContext
  );