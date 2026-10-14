import axios from "axios";
import { auth } from "./firebase";

const axiosInstance = axios.create({
  baseURL:
    process.env.NEXT_PUBLIC_BACKEND_URL,
});

// =====================================================
// AUTHENTICATION INTERCEPTOR
// =====================================================

axiosInstance.interceptors.request.use(
  async (config) => {
    try {
      // -----------------------------------------
      // Firebase ID token
      // -----------------------------------------

      const firebaseUser =
        auth.currentUser;

      if (firebaseUser) {
        const firebaseToken =
          await firebaseUser.getIdToken();

        config.headers =
          config.headers || {};

        config.headers.Authorization =
          `Bearer ${firebaseToken}`;
      }

      // -----------------------------------------
      // Trusted-device token
      // -----------------------------------------

      if (
        typeof window !==
        "undefined"
      ) {
        const trustedDeviceToken =
          localStorage.getItem(
            "yourtube-trusted-device-token"
          );

        if (trustedDeviceToken) {
          config.headers =
            config.headers || {};

          config.headers[
            "X-YourTube-Trusted-Device-Token"
          ] =
            trustedDeviceToken;
        }

        // -----------------------------------------
        // Security session token
        // -----------------------------------------

        const securitySessionToken =
          localStorage.getItem(
            "yourtube-security-session-token"
          );

        if (securitySessionToken) {
          config.headers =
            config.headers || {};

          config.headers[
            "X-YourTube-Security-Session-Token"
          ] =
            securitySessionToken;
        }
      }
    } catch (error) {
      console.error(
        "Axios authentication header error:",
        error
      );
    }

    return config;
  },
  (error) => {
    return Promise.reject(
      error
    );
  }
);

export default axiosInstance;