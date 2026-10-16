import crypto from "crypto";
import mongoose from "mongoose";

import users from "../Modals/Auth.js";
import LoginHistory from "../Modals/LoginHistory.js";
import OtpChallenge from "../Modals/OtpChallenge.js";
import TrustedDevice from "../Modals/TrustedDevice.js";

import {
  createSecuritySession,
} from "../services/securitySession.js";

import {
  sendLoginOtpEmail,
} from "../services/loginOtpEmail.js";

// =====================================================
// THEME HELPER
// =====================================================

// -----------------------------------------
// Get default theme based on current IST time
// -----------------------------------------

const getDefaultThemeByISTTime = () => {
  const currentISTTime =
    new Intl.DateTimeFormat(
      "en-IN",
      {
        timeZone:
          "Asia/Kolkata",

        hour:
          "numeric",

        minute:
          "numeric",

        hour12:
          false,
      }
    ).formatToParts(
      new Date()
    );

  const hourPart =
    currentISTTime.find(
      (part) =>
        part.type === "hour"
    );

  const minutePart =
    currentISTTime.find(
      (part) =>
        part.type === "minute"
    );

  const hour =
    Number(
      hourPart?.value ||
      0
    );

  const minute =
    Number(
      minutePart?.value ||
      0
    );

  const totalMinutes =
    hour * 60 +
    minute;

  const lightStart =
    5 * 60;

  const darkStart =
    12 * 60;

  if (
    totalMinutes >=
    lightStart &&
    totalMinutes <
    darkStart
  ) {
    return "light";
  }

  return "dark";
};

// =====================================================
// LOGIN INFORMATION HELPERS
// =====================================================

// -----------------------------------------
// Get client IP address
// -----------------------------------------

const getClientIpAddress = (
  req
) => {
  const forwardedFor =
    req.headers[
    "x-forwarded-for"
    ];

  if (forwardedFor) {
    const firstIp =
      forwardedFor
        .split(",")[0]
        ?.trim();

    if (firstIp) {
      return firstIp;
    }
  }

  return (
    req.socket?.remoteAddress ||
    req.ip ||
    "Unknown"
  );
};

// -----------------------------------------
// Check whether IP is local/private
// -----------------------------------------

const isLocalOrPrivateIp = (
  ipAddress
) => {
  if (!ipAddress) {
    return true;
  }

  const normalizedIp =
    ipAddress
      .replace(
        /^::ffff:/i,
        ""
      )
      .replace(
        /^\[|\]$/g,
        ""
      )
      .trim()
      .toLowerCase();

  if (
    normalizedIp ===
    "127.0.0.1" ||
    normalizedIp ===
    "localhost"
  ) {
    return true;
  }

  if (
    normalizedIp ===
    "::1"
  ) {
    return true;
  }

  if (
    normalizedIp.startsWith(
      "10."
    ) ||
    normalizedIp.startsWith(
      "192.168."
    ) ||
    normalizedIp.startsWith(
      "169.254."
    )
  ) {
    return true;
  }

  const parts =
    normalizedIp.split(
      "."
    );

  if (
    parts.length === 4 &&
    parts[0] === "172"
  ) {
    const secondPart =
      Number(
        parts[1]
      );

    if (
      secondPart >=
      16 &&
      secondPart <=
      31
    ) {
      return true;
    }
  }

  if (
    normalizedIp.startsWith(
      "fc"
    ) ||
    normalizedIp.startsWith(
      "fd"
    ) ||
    normalizedIp.startsWith(
      "fe80:"
    )
  ) {
    return true;
  }

  return false;
};

// =====================================================
// IP GEOLOCATION
// =====================================================

// -----------------------------------------
// Get approximate location from public IP
// -----------------------------------------

const getApproximateLocation =
  async (
    ipAddress
  ) => {
    if (
      isLocalOrPrivateIp(
        ipAddress
      )
    ) {
      return {
        city:
          "Unknown",

        state:
          "Unknown",

        country:
          "Unknown",

        latitude:
          null,

        longitude:
          null,
      };
    }

    try {
      const response =
        await fetch(
          `https://ipapi.co/${encodeURIComponent(
            ipAddress
          )}/json/`,
          {
            headers: {
              Accept:
                "application/json",

              "User-Agent":
                "YourTube/1.0",
            },

            signal:
              AbortSignal.timeout(
                5000
              ),
          }
        );

      if (!response.ok) {
        console.error(
          "IP geolocation request failed:",
          response.status
        );

        return {
          city:
            "Unknown",

          state:
            "Unknown",

          country:
            "Unknown",

          latitude:
            null,

          longitude:
            null,
        };
      }

      const locationData =
        await response.json();

      return {
        city:
          locationData?.city ||
          "Unknown",

        state:
          locationData?.region ||
          "Unknown",

        country:
          locationData?.country_name ||
          "Unknown",

        latitude:
          typeof locationData?.latitude ===
            "number"
            ? locationData.latitude
            : null,

        longitude:
          typeof locationData?.longitude ===
            "number"
            ? locationData.longitude
            : null,
      };
    } catch (error) {
      console.error(
        "IP geolocation error:",
        error
      );

      return {
        city:
          "Unknown",

        state:
          "Unknown",

        country:
          "Unknown",

        latitude:
          null,

        longitude:
          null,
      };
    }
  };

// =====================================================
// BROWSER / DEVICE DETECTION
// =====================================================

// -----------------------------------------
// Get browser information
// -----------------------------------------

const getBrowserInfo = (
  userAgent
) => {
  let match =
    userAgent.match(
      /Edg\/([\d.]+)/i
    );

  if (match) {
    return {
      browserName:
        "Microsoft Edge",

      browserVersion:
        match[1],
    };
  }

  match =
    userAgent.match(
      /OPR\/([\d.]+)/i
    );

  if (match) {
    return {
      browserName:
        "Opera",

      browserVersion:
        match[1],
    };
  }

  match =
    userAgent.match(
      /CriOS\/([\d.]+)/i
    );

  if (match) {
    return {
      browserName:
        "Google Chrome",

      browserVersion:
        match[1],
    };
  }

  match =
    userAgent.match(
      /FxiOS\/([\d.]+)/i
    );

  if (match) {
    return {
      browserName:
        "Mozilla Firefox",

      browserVersion:
        match[1],
    };
  }

  match =
    userAgent.match(
      /Chrome\/([\d.]+)/i
    );

  if (match) {
    return {
      browserName:
        "Google Chrome",

      browserVersion:
        match[1],
    };
  }

  match =
    userAgent.match(
      /Firefox\/([\d.]+)/i
    );

  if (match) {
    return {
      browserName:
        "Mozilla Firefox",

      browserVersion:
        match[1],
    };
  }

  match =
    userAgent.match(
      /Version\/([\d.]+).*Safari/i
    );

  if (match) {
    return {
      browserName:
        "Safari",

      browserVersion:
        match[1],
    };
  }

  match =
    userAgent.match(
      /(?:MSIE\s|rv:)([\d.]+)/i
    );

  if (
    match &&
    /MSIE|Trident/i.test(
      userAgent
    )
  ) {
    return {
      browserName:
        "Internet Explorer",

      browserVersion:
        match[1],
    };
  }

  return {
    browserName:
      "Unknown",

    browserVersion:
      "Unknown",
  };
};

// -----------------------------------------
// Get operating system
// -----------------------------------------

const getOperatingSystem = (
  userAgent
) => {
  if (
    /Windows NT/i.test(
      userAgent
    )
  ) {
    return "Windows";
  }

  if (
    /iPhone|iPad|iPod/i.test(
      userAgent
    )
  ) {
    return "iOS";
  }

  if (
    /Android/i.test(
      userAgent
    )
  ) {
    return "Android";
  }

  if (
    /Mac OS X/i.test(
      userAgent
    )
  ) {
    return "macOS";
  }

  if (
    /Linux/i.test(
      userAgent
    )
  ) {
    return "Linux";
  }

  if (
    /CrOS/i.test(
      userAgent
    )
  ) {
    return "ChromeOS";
  }

  return "Unknown";
};

// -----------------------------------------
// Get device type
// -----------------------------------------

const getDeviceType = (
  userAgent
) => {
  if (
    /iPad/i.test(
      userAgent
    ) ||
    (
      /Android/i.test(
        userAgent
      ) &&
      !/Mobile/i.test(
        userAgent
      )
    )
  ) {
    return "Tablet";
  }

  if (
    /iPhone|iPod/i.test(
      userAgent
    ) ||
    /Android.*Mobile/i.test(
      userAgent
    )
  ) {
    return "Mobile";
  }

  if (
    /Windows|Macintosh|Linux|CrOS/i.test(
      userAgent
    )
  ) {
    return "Desktop";
  }

  return "Unknown";
};

// -----------------------------------------
// Get device model where available
// -----------------------------------------

const getDeviceModel = (
  userAgent
) => {
  if (
    /iPhone/i.test(
      userAgent
    )
  ) {
    return "iPhone";
  }

  if (
    /iPad/i.test(
      userAgent
    )
  ) {
    return "iPad";
  }

  if (
    /Android/i.test(
      userAgent
    )
  ) {
    const androidMatch =
      userAgent.match(
        /Android[^;)]*;\s*(?:[^;)]*;\s*)?([^;)]+?)(?:\s+Build\/[^;)]+)?[;) ]/i
      );

    if (
      androidMatch?.[1]
    ) {
      const model =
        androidMatch[1].trim();

      if (
        model &&
        model !== "wv" &&
        !/^(wv|Mobile|Tablet)$/i.test(
          model
        )
      ) {
        return model;
      }
    }
  }

  return "Unknown";
};

// -----------------------------------------
// Build login information
// -----------------------------------------

const getLoginInformation = (
  req
) => {
  const userAgent =
    req.headers[
    "user-agent"
    ] ||
    "Unknown";

  const browser =
    getBrowserInfo(
      userAgent
    );

  const operatingSystem =
    getOperatingSystem(
      userAgent
    );

  const deviceType =
    getDeviceType(
      userAgent
    );

  const deviceModel =
    getDeviceModel(
      userAgent
    );

  const ipAddress =
    getClientIpAddress(
      req
    );

  return {
    ipAddress,

    browserName:
      browser.browserName,

    browserVersion:
      browser.browserVersion,

    operatingSystem,

    deviceType,

    deviceModel,
  };
};

// =====================================================
// TRUSTED DEVICE HELPERS
// =====================================================

// -----------------------------------------
// Hash trusted-device token
// -----------------------------------------

const hashTrustedDeviceToken = (
  token
) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};

// -----------------------------------------
// Get trusted-device token from request
// -----------------------------------------

const getTrustedDeviceToken = (
  req
) => {
  const token =
    req.headers[
    "x-yourtube-trusted-device-token"
    ];

  if (!token) {
    return null;
  }

  return (
    String(token).trim() ||
    null
  );
};

// -----------------------------------------
// Check whether two values are useful
// -----------------------------------------

const isKnownValue = (
  value
) => {
  return (
    value !== undefined &&
    value !== null &&
    String(value)
      .trim()
      .toLowerCase() !==
    "unknown" &&
    String(value).trim() !==
    ""
  );
};

// -----------------------------------------
// Check whether trusted environment matches
// -----------------------------------------

const trustedEnvironmentMatches = (
  trustedDevice,
  loginInformation,
  locationInformation
) => {
  // -----------------------------------------
  // Browser
  // -----------------------------------------

  if (
    isKnownValue(
      trustedDevice.browserName
    ) &&
    isKnownValue(
      loginInformation.browserName
    ) &&
    trustedDevice.browserName !==
    loginInformation.browserName
  ) {
    return false;
  }

  // -----------------------------------------
  // Device type
  // -----------------------------------------

  if (
    isKnownValue(
      trustedDevice.deviceType
    ) &&
    isKnownValue(
      loginInformation.deviceType
    ) &&
    trustedDevice.deviceType !==
    loginInformation.deviceType
  ) {
    return false;
  }

  // -----------------------------------------
  // Device model
  // -----------------------------------------

  if (
    isKnownValue(
      trustedDevice.deviceModel
    ) &&
    isKnownValue(
      loginInformation.deviceModel
    ) &&
    trustedDevice.deviceModel !==
    loginInformation.deviceModel
  ) {
    return false;
  }

  // -----------------------------------------
  // Operating system
  // -----------------------------------------

  if (
    isKnownValue(
      trustedDevice.operatingSystem
    ) &&
    isKnownValue(
      loginInformation.operatingSystem
    ) &&
    trustedDevice.operatingSystem !==
    loginInformation.operatingSystem
  ) {
    return false;
  }

  // -----------------------------------------
  // IP address
  // -----------------------------------------

  if (
    isKnownValue(
      trustedDevice.lastIpAddress
    ) &&
    isKnownValue(
      loginInformation.ipAddress
    ) &&
    trustedDevice.lastIpAddress !==
    loginInformation.ipAddress
  ) {
    return false;
  }

  // -----------------------------------------
  // City
  // -----------------------------------------

  if (
    isKnownValue(
      trustedDevice.lastCity
    ) &&
    isKnownValue(
      locationInformation.city
    ) &&
    trustedDevice.lastCity !==
    locationInformation.city
  ) {
    return false;
  }

  // -----------------------------------------
  // State
  // -----------------------------------------

  if (
    isKnownValue(
      trustedDevice.lastState
    ) &&
    isKnownValue(
      locationInformation.state
    ) &&
    trustedDevice.lastState !==
    locationInformation.state
  ) {
    return false;
  }

  return true;
};

// -----------------------------------------
// Find active trusted device
// -----------------------------------------

const findTrustedDeviceForLogin =
  async ({
    userId,
    token,
    loginInformation,
    locationInformation,
  }) => {
    console.log(
      "======================================"
    );

    console.log(
      "TRUSTED DEVICE CHECK"
    );

    console.log(
      "======================================"
    );

    console.log(
      "Token received:",
      Boolean(token)
    );

    if (!token) {
      console.log(
        "No trusted-device token was received."
      );

      console.log(
        "======================================"
      );

      return null;
    }

    const tokenHash =
      hashTrustedDeviceToken(
        token
      );

    const trustedDevice =
      await TrustedDevice.findOne({
        userId,

        tokenHash,

        revokedAt: null,

        expiresAt: {
          $gt:
            new Date(),
        },
      });

    console.log(
      "Matching active trusted-device record found:",
      Boolean(
        trustedDevice
      )
    );

    if (!trustedDevice) {
      console.log(
        "The received token does not match an active trusted-device record."
      );

      console.log(
        "======================================"
      );

      return null;
    }

    console.log(
      "Trusted device record ID:",
      String(
        trustedDevice._id
      )
    );

    console.log(
      "Trusted browser:",
      trustedDevice.browserName
    );

    console.log(
      "Trusted operating system:",
      trustedDevice.operatingSystem
    );

    console.log(
      "Trusted device type:",
      trustedDevice.deviceType
    );

    console.log(
      "Trusted device model:",
      trustedDevice.deviceModel
    );

    // -----------------------------------------
    // Determine environment mismatches
    // -----------------------------------------

    const mismatches = [];

    if (
      isKnownValue(
        trustedDevice.browserName
      ) &&
      isKnownValue(
        loginInformation.browserName
      ) &&
      trustedDevice.browserName !==
      loginInformation.browserName
    ) {
      mismatches.push(
        "browser"
      );
    }

    if (
      isKnownValue(
        trustedDevice.deviceType
      ) &&
      isKnownValue(
        loginInformation.deviceType
      ) &&
      trustedDevice.deviceType !==
      loginInformation.deviceType
    ) {
      mismatches.push(
        "deviceType"
      );
    }

    if (
      isKnownValue(
        trustedDevice.deviceModel
      ) &&
      isKnownValue(
        loginInformation.deviceModel
      ) &&
      trustedDevice.deviceModel !==
      loginInformation.deviceModel
    ) {
      mismatches.push(
        "deviceModel"
      );
    }

    if (
      isKnownValue(
        trustedDevice.operatingSystem
      ) &&
      isKnownValue(
        loginInformation.operatingSystem
      ) &&
      trustedDevice.operatingSystem !==
      loginInformation.operatingSystem
    ) {
      mismatches.push(
        "operatingSystem"
      );
    }

    if (
      isKnownValue(
        trustedDevice.lastIpAddress
      ) &&
      isKnownValue(
        loginInformation.ipAddress
      ) &&
      trustedDevice.lastIpAddress !==
      loginInformation.ipAddress
    ) {
      mismatches.push(
        "ipAddress"
      );
    }

    if (
      isKnownValue(
        trustedDevice.lastCity
      ) &&
      isKnownValue(
        locationInformation.city
      ) &&
      trustedDevice.lastCity !==
      locationInformation.city
    ) {
      mismatches.push(
        "city"
      );
    }

    if (
      isKnownValue(
        trustedDevice.lastState
      ) &&
      isKnownValue(
        locationInformation.state
      ) &&
      trustedDevice.lastState !==
      locationInformation.state
    ) {
      mismatches.push(
        "state"
      );
    }

    console.log(
      "Environment mismatches:",
      mismatches.length >
        0
        ? mismatches
        : "None"
    );

    if (
      !trustedEnvironmentMatches(
        trustedDevice,
        loginInformation,
        locationInformation
      )
    ) {
      console.log(
        "Trusted device rejected because the environment does not match."
      );

      console.log(
        "======================================"
      );

      return null;
    }

    console.log(
      "Trusted device accepted."
    );

    console.log(
      "======================================"
    );

    return trustedDevice;
  };

// =====================================================
// OTP ENVIRONMENT MATCHING
// =====================================================

const otpChallengeEnvironmentMatches =
  (
    otpChallenge,
    loginInformation,
    locationInformation
  ) => {
    // -----------------------------------------
    // Browser
    // -----------------------------------------

    if (
      isKnownValue(
        otpChallenge.browserName
      ) &&
      isKnownValue(
        loginInformation.browserName
      ) &&
      otpChallenge.browserName !==
      loginInformation.browserName
    ) {
      return false;
    }

    // -----------------------------------------
    // Device type
    // -----------------------------------------

    if (
      isKnownValue(
        otpChallenge.deviceType
      ) &&
      isKnownValue(
        loginInformation.deviceType
      ) &&
      otpChallenge.deviceType !==
      loginInformation.deviceType
    ) {
      return false;
    }

    // -----------------------------------------
    // Device model
    // -----------------------------------------

    if (
      isKnownValue(
        otpChallenge.deviceModel
      ) &&
      isKnownValue(
        loginInformation.deviceModel
      ) &&
      otpChallenge.deviceModel !==
      loginInformation.deviceModel
    ) {
      return false;
    }

    // -----------------------------------------
    // Operating system
    // -----------------------------------------

    if (
      isKnownValue(
        otpChallenge.operatingSystem
      ) &&
      isKnownValue(
        loginInformation.operatingSystem
      ) &&
      otpChallenge.operatingSystem !==
      loginInformation.operatingSystem
    ) {
      return false;
    }

    // -----------------------------------------
    // IP address
    // -----------------------------------------

    if (
      isKnownValue(
        otpChallenge.ipAddress
      ) &&
      isKnownValue(
        loginInformation.ipAddress
      ) &&
      otpChallenge.ipAddress !==
      loginInformation.ipAddress
    ) {
      return false;
    }

    // -----------------------------------------
    // City
    // -----------------------------------------

    if (
      isKnownValue(
        otpChallenge.city
      ) &&
      isKnownValue(
        locationInformation.city
      ) &&
      otpChallenge.city !==
      locationInformation.city
    ) {
      return false;
    }

    // -----------------------------------------
    // State
    // -----------------------------------------

    if (
      isKnownValue(
        otpChallenge.state
      ) &&
      isKnownValue(
        locationInformation.state
      ) &&
      otpChallenge.state !==
      locationInformation.state
    ) {
      return false;
    }

    return true;
  };

// =====================================================
// ENVIRONMENT COMPARISON
// =====================================================

// -----------------------------------------
// Compare current login with previous
// successful / verified login
// -----------------------------------------

const detectNewLoginEnvironment =
  async (
    userId,
    loginInformation,
    locationInformation
  ) => {
    const previousLogin =
      await LoginHistory.findOne({
        userId,

        status: {
          $in: [
            "successful",
            "otp_verified",
          ],
        },
      }).sort({
        loginAt: -1,
      });

    if (!previousLogin) {
      return {
        isNewEnvironment:
          true,

        requiresOtp:
          true,

        changedFactors: [
          "first_login",
        ],
      };
    }

    const changedFactors =
      [];

    // -----------------------------------------
    // Browser
    // -----------------------------------------

    if (
      loginInformation.browserName !==
      "Unknown" &&
      previousLogin.browserName !==
      "Unknown" &&
      loginInformation.browserName !==
      previousLogin.browserName
    ) {
      changedFactors.push(
        "browser"
      );
    }

    // -----------------------------------------
    // Device
    // -----------------------------------------

    const currentDeviceType =
      loginInformation.deviceType;

    const previousDeviceType =
      previousLogin.deviceType;

    const currentDeviceModel =
      loginInformation.deviceModel;

    const previousDeviceModel =
      previousLogin.deviceModel;

    if (
      currentDeviceType !==
      "Unknown" &&
      previousDeviceType !==
      "Unknown" &&
      currentDeviceType !==
      previousDeviceType
    ) {
      changedFactors.push(
        "device"
      );
    } else if (
      currentDeviceModel !==
      "Unknown" &&
      previousDeviceModel !==
      "Unknown" &&
      currentDeviceModel !==
      previousDeviceModel
    ) {
      changedFactors.push(
        "device"
      );
    }

    // -----------------------------------------
    // IP
    // -----------------------------------------

    if (
      loginInformation.ipAddress !==
      "Unknown" &&
      loginInformation.ipAddress !==
      "::1" &&
      previousLogin.ipAddress !==
      "Unknown" &&
      previousLogin.ipAddress !==
      "::1" &&
      loginInformation.ipAddress !==
      previousLogin.ipAddress
    ) {
      changedFactors.push(
        "ip"
      );
    }

    // -----------------------------------------
    // City
    // -----------------------------------------

    if (
      locationInformation.city !==
      "Unknown" &&
      previousLogin.city !==
      "Unknown" &&
      locationInformation.city !==
      previousLogin.city
    ) {
      changedFactors.push(
        "city"
      );
    }

    // -----------------------------------------
    // State
    // -----------------------------------------

    if (
      locationInformation.state !==
      "Unknown" &&
      previousLogin.state !==
      "Unknown" &&
      locationInformation.state !==
      previousLogin.state
    ) {
      changedFactors.push(
        "state"
      );
    }

    return {
      isNewEnvironment:
        changedFactors.length >
        0,

      requiresOtp:
        changedFactors.length >
        0,

      changedFactors: [
        ...new Set(
          changedFactors
        ),
      ],
    };
  };

// =====================================================
// LOGIN HISTORY
// =====================================================

// -----------------------------------------
// Save login history
// -----------------------------------------

const saveLoginHistory =
  async (
    userId,
    loginInformation,
    locationInformation,
    status
  ) => {
    try {
      const duplicateWindowStart =
        new Date(
          Date.now() -
          10 * 1000
        );

      const recentLogin =
        await LoginHistory.findOne({
          userId,

          ipAddress:
            loginInformation.ipAddress,

          browserName:
            loginInformation.browserName,

          browserVersion:
            loginInformation.browserVersion,

          operatingSystem:
            loginInformation.operatingSystem,

          deviceType:
            loginInformation.deviceType,

          deviceModel:
            loginInformation.deviceModel,

          loginAt: {
            $gte:
              duplicateWindowStart,
          },
        }).sort({
          loginAt: -1,
        });

      if (recentLogin) {
        return recentLogin;
      }

      return await LoginHistory.create({
        userId,

        ...loginInformation,

        ...locationInformation,

        loginAt:
          new Date(),

        status,
      });
    } catch (error) {
      console.error(
        "Login history save error:",
        error
      );

      return null;
    }
  };

// =====================================================
// OTP HELPERS
// =====================================================

// -----------------------------------------
// OTP configuration
// -----------------------------------------

const getOtpExpiryMinutes =
  () => {
    const configuredValue =
      Number(
        process.env
          .OTP_EXPIRES_MINUTES
      );

    if (
      Number.isFinite(
        configuredValue
      ) &&
      configuredValue >
      0
    ) {
      return configuredValue;
    }

    return 10;
  };

// -----------------------------------------
// Generate 6-digit OTP
// -----------------------------------------

const generateOtp = () => {
  return String(
    crypto.randomInt(
      100000,
      1000000
    )
  );
};

// -----------------------------------------
// Hash OTP
// -----------------------------------------

const hashOtp = (
  otp,
  salt
) => {
  return crypto
    .scryptSync(
      otp,
      salt,
      64
    )
    .toString("hex");
};

// -----------------------------------------
// Create OTP challenge and send email
// -----------------------------------------

const createAndSendOtpChallenge =
  async ({
    userId,
    email,
    name,
    loginHistoryId,
    loginInformation,
    locationInformation,
  }) => {
    const expiresInMinutes =
      getOtpExpiryMinutes();

    const otp =
      generateOtp();

    const otpSalt =
      crypto
        .randomBytes(
          16
        )
        .toString("hex");

    const otpHash =
      hashOtp(
        otp,
        otpSalt
      );

    const expiresAt =
      new Date(
        Date.now() +
        expiresInMinutes *
        60 *
        1000
      );

    // -----------------------------------------
    // Mark older pending challenges as expired
    // -----------------------------------------

    await OtpChallenge.updateMany(
      {
        userId,

        status:
          "pending",

        expiresAt: {
          $gt:
            new Date(),
        },
      },
      {
        $set: {
          status:
            "expired",
        },
      }
    );

    // -----------------------------------------
    // Create new OTP challenge
    // -----------------------------------------

    const challenge =
      await OtpChallenge.create({
        userId,

        deliveryMethod:
          "email",

        deliveryTarget:
          email,

        otpHash,

        otpSalt,

        status:
          "pending",

        attemptCount:
          0,

        maxAttempts:
          5,

        // -----------------------------------------
        // Login environment
        // -----------------------------------------

        browserName:
          loginInformation?.browserName ||
          "Unknown",

        browserVersion:
          loginInformation?.browserVersion ||
          "Unknown",

        operatingSystem:
          loginInformation?.operatingSystem ||
          "Unknown",

        deviceType:
          loginInformation?.deviceType ||
          "Unknown",

        deviceModel:
          loginInformation?.deviceModel ||
          "Unknown",

        ipAddress:
          loginInformation?.ipAddress ||
          "Unknown",

        city:
          locationInformation?.city ||
          "Unknown",

        state:
          locationInformation?.state ||
          "Unknown",

        country:
          locationInformation?.country ||
          "Unknown",

        latitude:
          locationInformation?.latitude ??
          null,

        longitude:
          locationInformation?.longitude ??
          null,

        expiresAt,

        loginHistoryId:
          loginHistoryId ||
          null,
      });

    // -----------------------------------------
    // Send OTP
    // -----------------------------------------

    try {
      console.log("DEBUG: About to send login OTP email");
      await sendLoginOtpEmail({
        email,

        name,

        otp,

        expiresInMinutes,

        browserName:
          loginInformation?.browserName ||
          "Unknown",

        deviceType:
          loginInformation?.deviceType ||
          "Unknown",

        city:
          locationInformation?.city ||
          "Unknown",

        state:
          locationInformation?.state ||
          "Unknown",
      });

      console.log("DEBUG: Login OTP email function completed");

      return {
        success:
          true,

        challengeId:
          challenge._id,

        expiresAt:
          challenge.expiresAt,
      };
    } catch (error) {
      challenge.status =
        "failed";

      await challenge.save();

      console.error(
        "Unable to send login OTP:",
        error
      );

      return {
        success:
          false,

        challengeId:
          challenge._id,

        expiresAt:
          challenge.expiresAt,

        error:
          "Unable to send verification email.",
      };
    }
  };

// =====================================================
// LOGIN
// =====================================================

export const login = async (
  req,
  res
) => {
  const {
    email,
    name,
    image,
  } = req.body;

  try {
    // -----------------------------------------
    // Validate email
    // -----------------------------------------

    if (!email) {
      return res.status(400).json({
        message:
          "Email is required.",
      });
    }

    // -----------------------------------------
    // Collect login information
    // -----------------------------------------

    const loginInformation =
      getLoginInformation(
        req
      );

    // -----------------------------------------
    // Get approximate location
    // -----------------------------------------

    const locationInformation =
      await getApproximateLocation(
        loginInformation.ipAddress
      );

    // -----------------------------------------
    // Get trusted-device token
    // -----------------------------------------

    const trustedDeviceToken =
      getTrustedDeviceToken(
        req
      );

    // -----------------------------------------
    // Find user
    // -----------------------------------------

    const existingUser =
      await users.findOne({
        email,
      });

    // =================================================
    // NEW USER
    // =================================================

    if (!existingUser) {
      const defaultTheme =
        getDefaultThemeByISTTime();

      const newUser =
        await users.create({
          email,

          name,

          image,

          themePreference:
            defaultTheme,
        });

      const securityCheck =
        await detectNewLoginEnvironment(
          newUser._id,
          loginInformation,
          locationInformation
        );

      const loginStatus =
        securityCheck.requiresOtp
          ? "otp_required"
          : "successful";

      const loginHistory =
        await saveLoginHistory(
          newUser._id,
          loginInformation,
          locationInformation,
          loginStatus
        );

      let otpResult =
        null;

      if (
        securityCheck.requiresOtp
      ) {
        otpResult =
          await createAndSendOtpChallenge({
            userId:
              newUser._id,

            email,

            name,

            loginHistoryId:
              loginHistory?._id ||
              null,

            loginInformation,

            locationInformation,
          });
      }

      return res.status(201).json({
        result:
          newUser,

        security: {
          requiresOtp:
            securityCheck.requiresOtp,

          isNewEnvironment:
            securityCheck.isNewEnvironment,

          changedFactors:
            securityCheck.changedFactors,

          loginHistoryId:
            loginHistory?._id ||
            null,

          otpSent:
            otpResult?.success ||
            false,

          otpChallengeId:
            otpResult?.challengeId ||
            null,

          otpExpiresAt:
            otpResult?.expiresAt ||
            null,

          trustedDevice:
            false,

          securitySessionId:
            null,

          securitySessionToken:
            null,

          securitySessionExpiresAt:
            null,
        },
      });
    }

    // =================================================
    // EXISTING USER
    // =================================================

    // -----------------------------------------
    // Apply default theme only when absent
    // -----------------------------------------

    if (
      !existingUser.themePreference
    ) {
      existingUser.themePreference =
        getDefaultThemeByISTTime();

      await existingUser.save();
    }

    // =================================================
    // CHECK TRUSTED DEVICE
    // =================================================

    /*
      We check the trusted device BEFORE checking for
      a pending OTP.

      This allows an already-trusted browser/device
      to bypass OTP.
    */

    const trustedDevice =
      await findTrustedDeviceForLogin({
        userId:
          existingUser._id,

        token:
          trustedDeviceToken,

        loginInformation,

        locationInformation,
      });

    // =================================================
    // TRUSTED LOGIN
    // =================================================

    if (
      trustedDevice
    ) {
      // -----------------------------------------
      // Update last-used time
      // -----------------------------------------

      trustedDevice.lastUsedAt =
        new Date();

      await trustedDevice.save();

      // -----------------------------------------
      // Record successful login
      // -----------------------------------------

      const loginHistory =
        await saveLoginHistory(
          existingUser._id,
          loginInformation,
          locationInformation,
          "successful"
        );

      // -----------------------------------------
      // Create security session
      // -----------------------------------------

      const securitySession =
        await createSecuritySession({
          userId:
            existingUser._id,

          loginHistoryId:
            loginHistory?._id ||
            null,

          authenticationMethod:
            "trusted_device",

          loginInformation,

          locationInformation,
        });

      return res.status(200).json({
        result:
          existingUser,

        security: {
          requiresOtp:
            false,

          isNewEnvironment:
            false,

          changedFactors:
            [],

          loginHistoryId:
            loginHistory?._id ||
            null,

          otpSent:
            false,

          otpChallengeId:
            null,

          otpExpiresAt:
            null,

          trustedDevice:
            true,

          securitySessionId:
            securitySession.securitySessionId,

          securitySessionToken:
            securitySession.securitySessionToken,

          securitySessionExpiresAt:
            securitySession.expiresAt,
        },
      });
    }

    // =================================================
    // CHECK EXISTING PENDING OTP
    // =================================================

    const pendingOtpChallenge =
      await OtpChallenge.findOne({
        userId:
          existingUser._id,

        status:
          "pending",

        expiresAt: {
          $gt:
            new Date(),
        },
      }).sort({
        createdAt:
          -1,
      });

    if (
      pendingOtpChallenge
    ) {
      // -----------------------------------------
      // Check whether the pending OTP belongs to
      // the current login environment
      // -----------------------------------------

      const sameEnvironment =
        otpChallengeEnvironmentMatches(
          pendingOtpChallenge,
          loginInformation,
          locationInformation
        );

      if (
        sameEnvironment
      ) {
        return res.status(200).json({
          result:
            existingUser,

          security: {
            requiresOtp:
              true,

            isNewEnvironment:
              true,

            changedFactors:
              [
                "otp_pending",
              ],

            loginHistoryId:
              pendingOtpChallenge.loginHistoryId ||
              null,

            otpSent:
              true,

            otpChallengeId:
              pendingOtpChallenge._id,

            otpExpiresAt:
              pendingOtpChallenge.expiresAt,

            trustedDevice:
              false,

            securitySessionId:
              null,

            securitySessionToken:
              null,

            securitySessionExpiresAt:
              null,
          },
        });
      }

      // -----------------------------------------
      // Pending OTP belongs to another environment
      // -----------------------------------------

      pendingOtpChallenge.status =
        "expired";

      await pendingOtpChallenge.save();

      console.log(
        "Existing pending OTP belongs to a different login environment. A new OTP will be created."
      );
    }

    // -----------------------------------------
    // Detect login environment
    // -----------------------------------------

    const securityCheck =
      await detectNewLoginEnvironment(
        existingUser._id,
        loginInformation,
        locationInformation
      );

    // =================================================
    // IMPORTANT SECURITY CHANGE
    // =================================================

    /*
      Reaching this point means that there is NO
      active trusted device for the current browser /
      device.

      Therefore OTP verification is required.

      This is important because simply having used OTP
      successfully in the past must NOT automatically
      make the browser trusted.

      Only the "Trust this device" flow should create
      the trusted-device token that allows future
      OTP-free logins.
    */

    if (
      !securityCheck.requiresOtp
    ) {
      securityCheck.requiresOtp =
        true;

      securityCheck.changedFactors =
        [
          ...new Set([
            ...securityCheck.changedFactors,
            "untrusted_device",
          ]),
        ];
    }

    const loginStatus =
      securityCheck.requiresOtp
        ? "otp_required"
        : "successful";

    // -----------------------------------------
    // Save login history
    // -----------------------------------------

    const loginHistory =
      await saveLoginHistory(
        existingUser._id,
        loginInformation,
        locationInformation,
        loginStatus
      );

    // -----------------------------------------
    // Create security session only when OTP
    // is NOT required
    // -----------------------------------------

    let securitySession =
      null;

    if (
      !securityCheck.requiresOtp
    ) {
      securitySession =
        await createSecuritySession({
          userId:
            existingUser._id,

          loginHistoryId:
            loginHistory?._id ||
            null,

          authenticationMethod:
            "standard",

          loginInformation,

          locationInformation,
        });
    }

    // -----------------------------------------
    // Send OTP
    // -----------------------------------------

    let otpResult =
      null;

    if (
      securityCheck.requiresOtp
    ) {
      otpResult =
        await createAndSendOtpChallenge({
          userId:
            existingUser._id,

          email:
            existingUser.email,

          name:
            existingUser.name,

          loginHistoryId:
            loginHistory?._id ||
            null,

          loginInformation,

          locationInformation,
        });
    }

    return res.status(200).json({
      result:
        existingUser,

      security: {
        requiresOtp:
          securityCheck.requiresOtp,

        isNewEnvironment:
          securityCheck.isNewEnvironment,

        changedFactors:
          securityCheck.changedFactors,

        loginHistoryId:
          loginHistory?._id ||
          null,

        otpSent:
          otpResult?.success ||
          false,

        otpChallengeId:
          otpResult?.challengeId ||
          null,

        otpExpiresAt:
          otpResult?.expiresAt ||
          null,

        trustedDevice:
          false,

        securitySessionId:
          securitySession
            ?.securitySessionId ||
          null,

        securitySessionToken:
          securitySession
            ?.securitySessionToken ||
          null,

        securitySessionExpiresAt:
          securitySession?.expiresAt ||
          null,
      },
    });
  } catch (error) {
    console.error(
      "Login error:",
      error
    );

    return res.status(500).json({
      message:
        "Something went wrong",
    });
  }
};

// =====================================================
// UPDATE PROFILE
// =====================================================

export const updateprofile =
  async (
    req,
    res
  ) => {
    const {
      id: _id,
    } = req.params;

    const {
      channelname,
      description,
      themePreference,
    } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(
        _id
      )
    ) {
      return res.status(500).json({
        message:
          "User unavailable...",
      });
    }

    try {
      const updateFields =
        {};

      // -----------------------------------------
      // Existing channel fields
      // -----------------------------------------

      if (
        channelname !==
        undefined
      ) {
        updateFields.channelname =
          channelname;
      }

      if (
        description !==
        undefined
      ) {
        updateFields.description =
          description;
      }

      // -----------------------------------------
      // Theme preference
      // -----------------------------------------

      if (
        themePreference !==
        undefined
      ) {
        if (
          [
            "light",
            "dark",
          ].includes(
            themePreference
          ) === false
        ) {
          return res.status(400).json({
            message:
              "Invalid theme preference",
          });
        }

        updateFields.themePreference =
          themePreference;
      }

      const updatedata =
        await users.findByIdAndUpdate(
          _id,
          {
            $set:
              updateFields,
          },
          {
            new:
              true,
          }
        );

      if (!updatedata) {
        return res.status(404).json({
          message:
            "User not found.",
        });
      }

      return res.status(201).json(
        updatedata
      );
    } catch (error) {
      console.error(
        error
      );

      return res.status(500).json({
        message:
          "Something went wrong",
      });
    }
  };