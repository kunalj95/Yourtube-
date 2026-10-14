import mongoose from "mongoose";

import comment from "../Modals/comment.js";
import CommentHistory from "../Modals/CommentHistory.js";
import CommentModeration from "../Modals/CommentModeration.js";
import CommentSecurity from "../Modals/CommentSecurity.js";
import users from "../Modals/Auth.js";
import BadWordsFilter from "@azamani/badwords-filter";

// =====================================================
// PROFANITY FILTER
// =====================================================

const profanityFilter =
  new BadWordsFilter().loadAllLanguages();

// =====================================================
// RATE LIMIT CONFIGURATION
// =====================================================

const COMMENT_RATE_LIMIT = 5;
const COMMENT_RATE_WINDOW_MS =
  60 * 1000;

// =====================================================
// COMMENT TEXT HELPERS
// =====================================================

// -----------------------------------------
// Check whether text contains profanity
// -----------------------------------------

const containsProfanity = (text) => {
  try {
    if (
      typeof text !== "string" ||
      !text.trim()
    ) {
      return false;
    }

    const detectedWords =
      profanityFilter.detect(text);

    return (
      Array.isArray(detectedWords) &&
      detectedWords.length > 0
    );
  } catch (error) {
    console.error(
      "Profanity filter error:",
      error
    );

    // Fail closed.
    return true;
  }
};

// -----------------------------------------
// Normalize comment text
// -----------------------------------------

const normalizeCommentText = (
  text
) => {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
};

// =====================================================
// CLIENT IP
// =====================================================

const getClientIp = (req) => {
  const forwardedFor =
    req.headers[
      "x-forwarded-for"
    ];

  if (
    typeof forwardedFor ===
      "string" &&
    forwardedFor.trim()
  ) {
    return forwardedFor
      .split(",")[0]
      .trim();
  }

  return (
    req.ip ||
    req.socket?.remoteAddress ||
    "Unknown"
  );
};

// =====================================================
// CLOUDFLARE TURNSTILE VERIFICATION
// =====================================================

const verifyTurnstileToken =
  async (
    req,
    token
  ) => {
    // -----------------------------------------
    // Token validation
    // -----------------------------------------

    if (
      typeof token !== "string" ||
      !token.trim()
    ) {
      return {
        success: false,
        errorCodes: [
          "missing-input-response",
        ],
      };
    }

    // -----------------------------------------
    // Cloudflare token maximum length
    // -----------------------------------------

    if (
      token.length > 2048
    ) {
      return {
        success: false,
        errorCodes: [
          "invalid-input-response",
        ],
      };
    }

    // -----------------------------------------
    // Secret key
    // -----------------------------------------

    const secretKey =
      process.env
        .TURNSTILE_SECRET_KEY;

    if (!secretKey) {
      console.error(
        "TURNSTILE_SECRET_KEY is missing from server .env"
      );

      return {
        success: false,
        errorCodes: [
          "missing-secret-key",
        ],
      };
    }

    // -----------------------------------------
    // Verify with Cloudflare
    // -----------------------------------------

    try {
      const response =
        await fetch(
          "https://challenges.cloudflare.com/turnstile/v0/siteverify",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              secret:
                secretKey,

              response:
                token,

              remoteip:
                getClientIp(req),
            }),
          }
        );

      if (
        !response.ok
      ) {
        console.error(
          "Turnstile Siteverify HTTP error:",
          response.status
        );

        return {
          success: false,

          errorCodes: [
            "siteverify-http-error",
          ],
        };
      }

      const result =
        await response.json();

      return result;
    } catch (error) {
      console.error(
        "Turnstile verification error:",
        error
      );

      return {
        success: false,

        errorCodes: [
          "siteverify-request-failed",
        ],
      };
    }
  };

// =====================================================
// RATE LIMIT + CAPTCHA CHECK
// =====================================================

const checkCommentRateLimit =
  async (
    req,
    userId,
    videoId,
    turnstileToken
  ) => {
    const now =
      Date.now();

    const windowStartedAt =
      new Date(
        now -
          COMMENT_RATE_WINDOW_MS
      );

    // -----------------------------------------
    // Count recent attempts
    // -----------------------------------------

    const existingAttempts =
      await CommentSecurity.countDocuments(
        {
          userId,

          eventType:
            "comment_attempt",

          eventAt: {
            $gte:
              windowStartedAt,
          },
        }
      );

    const currentAttempt =
      existingAttempts + 1;

    const ipAddress =
      getClientIp(req);

    const userAgent =
      req.headers[
        "user-agent"
      ] ||
      "Unknown";

    // =================================================
    // RATE LIMIT ALREADY REACHED
    // =================================================

    if (
      existingAttempts >=
      COMMENT_RATE_LIMIT
    ) {
      // -----------------------------------------
      // CAPTCHA is required
      // -----------------------------------------

      if (
        typeof turnstileToken !==
          "string" ||
        !turnstileToken.trim()
      ) {
        try {
          await CommentSecurity.create({
            userId,

            videoId,

            ipAddress,

            userAgent,

            eventType:
              "captcha_required",

            reason:
              "captcha_required",

            captchaRequired:
              true,

            captchaPassed:
              false,

            attemptCount:
              currentAttempt,

            windowStartedAt,

            windowExpiresAt:
              new Date(
                now +
                  COMMENT_RATE_WINDOW_MS
              ),

            metadata: {
              rateLimit:
                COMMENT_RATE_LIMIT,

              rateWindowMs:
                COMMENT_RATE_WINDOW_MS,
            },

            eventAt:
              new Date(),
          });
        } catch (
          securityError
        ) {
          console.error(
            "CAPTCHA required logging error:",
            securityError
          );
        }

        return {
          limited: false,

          captchaRequired:
            true,

          captchaPassed:
            false,

          captchaFailed:
            false,

          attemptCount:
            currentAttempt,

          remaining:
            0,

          retryAfterSeconds:
            Math.ceil(
              COMMENT_RATE_WINDOW_MS /
                1000
            ),
        };
      }

      // =================================================
      // VERIFY CAPTCHA
      // =================================================

      const turnstileResult =
        await verifyTurnstileToken(
          req,
          turnstileToken
        );

      // -----------------------------------------
      // CAPTCHA failed
      // -----------------------------------------

      if (
        !turnstileResult?.success
      ) {
        try {
          await CommentSecurity.create({
            userId,

            videoId,

            ipAddress,

            userAgent,

            eventType:
              "captcha_failed",

            reason:
              "captcha_failed",

            captchaRequired:
              true,

            captchaPassed:
              false,

            attemptCount:
              currentAttempt,

            windowStartedAt,

            windowExpiresAt:
              new Date(
                now +
                  COMMENT_RATE_WINDOW_MS
              ),

            metadata: {
              errorCodes:
                turnstileResult?.[
                  "error-codes"
                ] || [],

              turnstileSuccess:
                false,
            },

            eventAt:
              new Date(),
          });
        } catch (
          securityError
        ) {
          console.error(
            "CAPTCHA failed logging error:",
            securityError
          );
        }

        return {
          limited: false,

          captchaRequired:
            true,

          captchaPassed:
            false,

          captchaFailed:
            true,

          attemptCount:
            currentAttempt,

          remaining:
            0,
        };
      }

      // -----------------------------------------
      // CAPTCHA passed
      // -----------------------------------------

      try {
        await CommentSecurity.create({
          userId,

          videoId,

          ipAddress,

          userAgent,

          eventType:
            "captcha_passed",

          reason:
            "none",

          captchaRequired:
            true,

          captchaPassed:
            true,

          attemptCount:
            currentAttempt,

          windowStartedAt,

          windowExpiresAt:
            new Date(
              now +
                COMMENT_RATE_WINDOW_MS
            ),

          metadata: {
            turnstileSuccess:
              true,
          },

          eventAt:
            new Date(),
        });
      } catch (
        securityError
      ) {
        console.error(
          "CAPTCHA passed logging error:",
          securityError
        );
      }

      return {
        limited: false,

        captchaRequired:
          false,

        captchaPassed:
          true,

        captchaFailed:
          false,

        attemptCount:
          currentAttempt,

        remaining:
          0,
      };
    }

    // =================================================
    // NORMAL ATTEMPT
    // =================================================

    try {
      await CommentSecurity.create({
        userId,

        videoId,

        ipAddress,

        userAgent,

        eventType:
          "comment_attempt",

        reason:
          "none",

        captchaRequired:
          false,

        captchaPassed:
          false,

        attemptCount:
          currentAttempt,

        windowStartedAt:
          new Date(),

        windowExpiresAt:
          new Date(
            now +
              COMMENT_RATE_WINDOW_MS
          ),

        metadata: {
          rateLimit:
            COMMENT_RATE_LIMIT,

          rateWindowMs:
            COMMENT_RATE_WINDOW_MS,
        },

        eventAt:
          new Date(),
      });
    } catch (
      securityError
    ) {
      console.error(
        "Comment security logging error:",
        securityError
      );
    }

    return {
      limited: false,

      captchaRequired:
        false,

      captchaPassed:
        false,

      captchaFailed:
        false,

      attemptCount:
        currentAttempt,

      remaining:
        Math.max(
          0,
          COMMENT_RATE_LIMIT -
            currentAttempt
        ),

      retryAfterSeconds:
        0,
    };
  };

// =====================================================
// MALICIOUS LINK DETECTION
// =====================================================

const detectMaliciousLinks =
  (text) => {
    if (
      typeof text !==
        "string" ||
      !text.trim()
    ) {
      return {
        isMalicious:
          false,

        metadata: {},
      };
    }

    const urlMatches =
      text.match(
        /(?:https?:\/\/|www\.)[^\s<>"']+/gi
      ) || [];

    for (
      const rawUrl of urlMatches
    ) {
      try {
        let normalizedUrl =
          rawUrl.trim();

        if (
          normalizedUrl
            .toLowerCase()
            .startsWith("www.")
        ) {
          normalizedUrl =
            `https://${normalizedUrl}`;
        }

        const parsedUrl =
          new URL(
            normalizedUrl
          );

        const protocol =
          parsedUrl.protocol.toLowerCase();

        const hostname =
          parsedUrl.hostname.toLowerCase();

        // -----------------------------------------
        // Dangerous protocols
        // -----------------------------------------

        if (
          protocol ===
            "javascript:" ||
          protocol ===
            "data:" ||
          protocol ===
            "vbscript:" ||
          protocol ===
            "file:"
        ) {
          return {
            isMalicious:
              true,

            metadata: {
              type:
                "dangerous_protocol",

              url:
                rawUrl,

              protocol,
            },
          };
        }

        // -----------------------------------------
        // Only HTTP / HTTPS
        // -----------------------------------------

        if (
          protocol !==
            "http:" &&
          protocol !==
            "https:"
        ) {
          return {
            isMalicious:
              true,

            metadata: {
              type:
                "unsupported_protocol",

              url:
                rawUrl,

              protocol,
            },
          };
        }

        // -----------------------------------------
        // Embedded credentials
        // -----------------------------------------

        if (
          parsedUrl.username ||
          parsedUrl.password
        ) {
          return {
            isMalicious:
              true,

            metadata: {
              type:
                "embedded_credentials",

              url:
                rawUrl,

              hostname,
            },
          };
        }

        // -----------------------------------------
        // Localhost
        // -----------------------------------------

        const isLocalHost =
          hostname ===
            "localhost" ||
          hostname ===
            "localhost.localdomain" ||
          hostname ===
            "127.0.0.1" ||
          hostname ===
            "::1";

        if (
          isLocalHost
        ) {
          return {
            isMalicious:
              true,

            metadata: {
              type:
                "localhost_url",

              url:
                rawUrl,

              hostname,
            },
          };
        }

        // -----------------------------------------
        // IPv4 addresses
        // -----------------------------------------

        const ipv4Pattern =
          /^(?:\d{1,3}\.){3}\d{1,3}$/;

        if (
          ipv4Pattern.test(
            hostname
          )
        ) {
          const parts =
            hostname
              .split(".")
              .map(Number);

          const validIPv4 =
            parts.length === 4 &&
            parts.every(
              (part) =>
                Number.isInteger(
                  part
                ) &&
                part >= 0 &&
                part <= 255
            );

          if (
            validIPv4
          ) {
            const [
              first,
              second,
            ] = parts;

            const isPrivateIP =
              first === 10 ||
              (
                first === 172 &&
                second >= 16 &&
                second <= 31
              ) ||
              (
                first === 192 &&
                second === 168
              ) ||
              (
                first === 169 &&
                second === 254
              );

            if (
              isPrivateIP
            ) {
              return {
                isMalicious:
                  true,

                metadata: {
                  type:
                    "private_ip_url",

                  url:
                    rawUrl,

                  hostname,
                },
              };
            }

            return {
              isMalicious:
                true,

              metadata: {
                type:
                  "ip_address_url",

                url:
                  rawUrl,

                hostname,
              },
            };
          }
        }

        // -----------------------------------------
        // Excessive URL encoding
        // -----------------------------------------

        const encodedCharacters =
          (
            rawUrl.match(
              /%[0-9a-f]{2}/gi
            ) || []
          ).length;

        if (
          encodedCharacters >=
          8
        ) {
          return {
            isMalicious:
              true,

            metadata: {
              type:
                "excessive_url_encoding",

              url:
                rawUrl,

              encodedCharacterCount:
                encodedCharacters,
            },
          };
        }
      } catch (error) {
        return {
          isMalicious:
            true,

          metadata: {
            type:
              "invalid_or_deceptive_url",

            url:
              rawUrl,
          },
        };
      }
    }

    const dangerousProtocolPattern =
      /\b(?:javascript|vbscript|data|file):/gi;

    const dangerousProtocolMatches =
      text.match(
        dangerousProtocolPattern
      ) || [];

    if (
      dangerousProtocolMatches.length >
      0
    ) {
      return {
        isMalicious:
          true,

        metadata: {
          type:
            "dangerous_protocol",

          protocols:
            dangerousProtocolMatches,
        },
      };
    }

    return {
      isMalicious:
        false,

      metadata: {},
    };
  };

// =====================================================
// SPAM / SPECIAL / EMOJI DETECTION
// =====================================================

const detectSpam = (text) => {
  if (
    typeof text !==
      "string" ||
    !text.trim()
  ) {
    return {
      isSpam:
        false,

      reason:
        null,

      metadata:
        {},
    };
  }

  const normalizedText =
    normalizeCommentText(
      text
    );

  // -----------------------------------------
  // Excessive links
  // -----------------------------------------

  const urlMatches =
    text.match(
      /(https?:\/\/|www\.)[^\s]+/gi
    ) || [];

  if (
    urlMatches.length >= 3
  ) {
    return {
      isSpam:
        true,

      reason:
        "spam",

      metadata: {
        type:
          "excessive_links",

        linkCount:
          urlMatches.length,
      },
    };
  }

  // -----------------------------------------
  // Repeated word
  // -----------------------------------------

  const words =
    normalizedText
      .split(/\s+/)
      .filter(Boolean);

  const wordCounts =
    {};

  for (
    const word of words
  ) {
    if (
      word.length < 2
    ) {
      continue;
    }

    wordCounts[word] =
      (
        wordCounts[word] ||
        0
      ) + 1;
  }

  const repeatedWord =
    Object.entries(
      wordCounts
    ).find(
      ([, count]) =>
        count >= 5
    );

  if (
    repeatedWord
  ) {
    return {
      isSpam:
        true,

      reason:
        "spam",

      metadata: {
        type:
          "repeated_word",

        word:
          repeatedWord[0],

        count:
          repeatedWord[1],
      },
    };
  }

  // -----------------------------------------
  // Repeated phrase
  // -----------------------------------------

  if (
    words.length >= 6
  ) {
    const phraseCounts =
      {};

    for (
      let i = 0;
      i <=
        words.length - 2;
      i++
    ) {
      const phrase =
        `${words[i]} ${words[i + 1]}`;

      phraseCounts[phrase] =
        (
          phraseCounts[phrase] ||
          0
        ) + 1;
    }

    const repeatedPhrase =
      Object.entries(
        phraseCounts
      ).find(
        ([, count]) =>
          count >= 3
      );

    if (
      repeatedPhrase
    ) {
      return {
        isSpam:
          true,

        reason:
          "spam",

        metadata: {
          type:
            "repeated_phrase",

          phrase:
            repeatedPhrase[0],

          count:
            repeatedPhrase[1],
        },
      };
    }
  }

  // -----------------------------------------
  // Emoji spam
  // -----------------------------------------

  const emojiMatches =
    text.match(
      /\p{Extended_Pictographic}/gu
    ) || [];

  if (
    emojiMatches.length > 0
  ) {
    const emojiCounts =
      {};

    for (
      const emoji of
      emojiMatches
    ) {
      emojiCounts[emoji] =
        (
          emojiCounts[emoji] ||
          0
        ) + 1;
    }

    const repeatedEmoji =
      Object.entries(
        emojiCounts
      ).find(
        ([, count]) =>
          count >= 5
      );

    if (
      repeatedEmoji
    ) {
      return {
        isSpam:
          true,

        reason:
          "repeated_emoji",

        metadata: {
          type:
            "repeated_emoji",

          emoji:
            repeatedEmoji[0],

          count:
            repeatedEmoji[1],
        },
      };
    }

    const hasLettersOrNumbers =
      /[\p{L}\p{N}]/u.test(
        text
      );

    if (
      emojiMatches.length >= 8 &&
      !hasLettersOrNumbers
    ) {
      return {
        isSpam:
          true,

        reason:
          "repeated_emoji",

        metadata: {
          type:
            "emoji_flood",

          emojiCount:
            emojiMatches.length,
        },
      };
    }
  }

  // -----------------------------------------
  // Repeated special characters
  // -----------------------------------------

  const specialCharacterMatches =
    text.match(
      /[^\p{L}\p{N}\s]/gu
    ) || [];

  const specialCharacterCounts =
    {};

  for (
    const character of
    specialCharacterMatches
  ) {
    if (
      /\p{Extended_Pictographic}/u.test(
        character
      )
    ) {
      continue;
    }

    specialCharacterCounts[
      character
    ] =
      (
        specialCharacterCounts[
          character
        ] || 0
      ) + 1;
  }

  const repeatedSpecialCharacter =
    Object.entries(
      specialCharacterCounts
    ).find(
      ([, count]) =>
        count >= 5
    );

  if (
    repeatedSpecialCharacter
  ) {
    return {
      isSpam:
        true,

      reason:
        "repeated_special_characters",

      metadata: {
        type:
          "repeated_special_character",

        character:
          repeatedSpecialCharacter[0],

        count:
          repeatedSpecialCharacter[1],
      },
    };
  }

  // -----------------------------------------
  // Special-character-only flood
  // -----------------------------------------

  const hasNormalText =
    /[\p{L}\p{N}]/u.test(
      text
    );

  if (
    specialCharacterMatches.length >=
      10 &&
    !hasNormalText
  ) {
    return {
      isSpam:
        true,

      reason:
        "repeated_special_characters",

      metadata: {
        type:
          "special_character_flood",

        specialCharacterCount:
          specialCharacterMatches.length,
      },
    };
  }

  return {
    isSpam:
      false,

    reason:
      null,

    metadata:
      {},
  };
};

// =====================================================
// MODERATION SOURCE
// =====================================================

const getModerationSource =
  (reason) => {
    if (
      reason ===
      "repeated_special_characters"
    ) {
      return "special_character_detection";
    }

    if (
      reason ===
      "repeated_emoji"
    ) {
      return "emoji_spam_detection";
    }

    if (
      reason ===
      "malicious_link"
    ) {
      return "malicious_link_detection";
    }

    return "spam_detection";
  };

// =====================================================
// CONFIGURATION
// =====================================================

const getCommentEditWindowMinutes =
  () => {
    const configuredValue =
      Number(
        process.env
          .COMMENT_EDIT_WINDOW_MINUTES
      );

    if (
      Number.isFinite(
        configuredValue
      ) &&
      configuredValue > 0
    ) {
      return configuredValue;
    }

    return 10;
  };

// =====================================================
// HELPERS
// =====================================================

const getAuthenticatedUserId = (
  req
) => {
  return (
    req.securityUserId ||
    null
  );
};

const isValidCommentId = (
  id
) => {
  return mongoose.Types.ObjectId.isValid(
    id
  );
};

const isValidVideoId = (
  id
) => {
  return mongoose.Types.ObjectId.isValid(
    id
  );
};

// =====================================================
// POST COMMENT
// =====================================================

export const postcomment = async (
  req,
  res
) => {
  try {
    // -----------------------------------------
    // Authentication
    // -----------------------------------------

    const authenticatedUserId =
      getAuthenticatedUserId(
        req
      );

    if (
      !authenticatedUserId
    ) {
      return res.status(401).json({
        message:
          "Security session is required.",
      });
    }

    // -----------------------------------------
    // Request data
    // -----------------------------------------

    const {
      videoid,
      commentbody,
      parentCommentId,
      turnstileToken,
    } = req.body;

    // -----------------------------------------
    // Validate video ID
    // -----------------------------------------

    if (
      !videoid ||
      !isValidVideoId(
        videoid
      )
    ) {
      return res.status(400).json({
        message:
          "Invalid video ID.",
      });
    }

    // =================================================
    // RATE LIMIT + CAPTCHA
    // =================================================

    const rateLimitResult =
      await checkCommentRateLimit(
        req,
        authenticatedUserId,
        videoid,
        turnstileToken
      );

    // -----------------------------------------
    // CAPTCHA required
    // -----------------------------------------

    if (
      rateLimitResult.captchaRequired
    ) {
      return res
        .status(403)
        .json({
          comment:
            false,

          blocked:
            true,

          captchaRequired:
            true,

          message:
            "Please complete the CAPTCHA verification before posting another comment.",
        });
    }

    // -----------------------------------------
    // CAPTCHA failed
    // -----------------------------------------

    if (
      rateLimitResult.captchaFailed
    ) {
      return res
        .status(403)
        .json({
          comment:
            false,

          blocked:
            true,

          captchaRequired:
            true,

          captchaFailed:
            true,

          message:
            "CAPTCHA verification failed. Please try again.",
        });
    }

    // -----------------------------------------
    // Validate comment
    // -----------------------------------------

    if (
      typeof commentbody !==
        "string" ||
      !commentbody.trim()
    ) {
      return res.status(400).json({
        message:
          "Comment cannot be empty.",
      });
    }

    const trimmedComment =
      commentbody.trim();

    // -----------------------------------------
    // Maximum length
    // -----------------------------------------

    if (
      trimmedComment.length >
      2000
    ) {
      return res.status(400).json({
        message:
          "Comment is too long. Maximum 2000 characters are allowed.",
      });
    }

    // -----------------------------------------
    // Parent comment
    // -----------------------------------------

    let parentComment =
      null;

    if (
      parentCommentId !==
        undefined &&
      parentCommentId !==
        null &&
      parentCommentId !==
        ""
    ) {
      if (
        !isValidCommentId(
          parentCommentId
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid parent comment ID.",
        });
      }

      parentComment =
        await comment.findOne({
          _id:
            parentCommentId,

          deletedAt:
            null,

          moderationStatus: {
            $nin: [
              "blocked",
              "deleted",
            ],
          },
        });

      if (
        !parentComment
      ) {
        return res.status(404).json({
          message:
            "Parent comment not found.",
        });
      }
    }

    // -----------------------------------------
    // Current user
    // -----------------------------------------

    const currentUser =
      await users.findById(
        authenticatedUserId
      );

    if (!currentUser) {
      return res.status(404).json({
        message:
          "User not found.",
      });
    }

    // =================================================
    // PROFANITY CHECK
    // =================================================

    const profanityDetected =
      containsProfanity(
        trimmedComment
      );

    if (
      profanityDetected
    ) {
      const blockedComment =
        new comment({
          userid:
            authenticatedUserId,

          videoid,

          commentbody:
            trimmedComment,

          usercommented:
            currentUser.name ||
            "Anonymous",

          commentedon:
            new Date(),

          userimage:
            currentUser.image ||
            "",

          parentCommentId:
            parentComment
              ? parentComment._id
              : null,

          isEdited:
            false,

          editedAt:
            null,

          editDeadline:
            new Date(
              Date.now() +
                getCommentEditWindowMinutes() *
                  60 *
                  1000
            ),

          moderationStatus:
            "blocked",

          moderationReason:
            "profanity",

          deletedAt:
            null,

          likeCount:
            0,

          dislikeCount:
            0,
        });

      await blockedComment.save();

      try {
        await CommentModeration.create({
          commentId:
            blockedComment._id,

          videoId:
            blockedComment.videoid,

          userId:
            blockedComment.userid,

          source:
            "profanity_filter",

          reason:
            "profanity",

          action:
            "blocked",

          status:
            "completed",

          note:
            "Comment blocked by profanity filter.",

          metadata: {
            filter:
              "badwords-filter",
          },

          detectedAt:
            new Date(),

          resolvedAt:
            new Date(),
        });
      } catch (
        moderationError
      ) {
        console.error(
          "Comment moderation history error:",
          moderationError
        );
      }

      try {
        await CommentHistory.create({
          commentId:
            blockedComment._id,

          videoId:
            blockedComment.videoid,

          userId:
            blockedComment.userid,

          actorUserId:
            authenticatedUserId,

          action:
            "blocked",

          oldCommentBody:
            null,

          newCommentBody:
            null,

          reason:
            "profanity",

          moderationStatus:
            "blocked",

          actionAt:
            new Date(),
        });
      } catch (
        historyError
      ) {
        console.error(
          "Blocked comment history error:",
          historyError
        );
      }

      return res.status(400).json({
        comment:
          false,

        blocked:
          true,

        message:
          "Your comment was blocked because it contains inappropriate language.",
      });
    }

    // =================================================
    // MALICIOUS LINK CHECK
    // =================================================

    const maliciousLinkResult =
      detectMaliciousLinks(
        trimmedComment
      );

    if (
      maliciousLinkResult.isMalicious
    ) {
      const blockedComment =
        new comment({
          userid:
            authenticatedUserId,

          videoid,

          commentbody:
            trimmedComment,

          usercommented:
            currentUser.name ||
            "Anonymous",

          commentedon:
            new Date(),

          userimage:
            currentUser.image ||
            "",

          parentCommentId:
            parentComment
              ? parentComment._id
              : null,

          isEdited:
            false,

          editedAt:
            null,

          editDeadline:
            new Date(
              Date.now() +
                getCommentEditWindowMinutes() *
                  60 *
                  1000
            ),

          moderationStatus:
            "blocked",

          moderationReason:
            "malicious_link",

          deletedAt:
            null,

          likeCount:
            0,

          dislikeCount:
            0,
        });

      await blockedComment.save();

      try {
        await CommentModeration.create({
          commentId:
            blockedComment._id,

          videoId:
            blockedComment.videoid,

          userId:
            blockedComment.userid,

          source:
            "malicious_link_detection",

          reason:
            "malicious_link",

          action:
            "blocked",

          status:
            "completed",

          note:
            "Comment blocked because a suspicious or unsafe link pattern was detected.",

          metadata:
            maliciousLinkResult.metadata,

          detectedAt:
            new Date(),

          resolvedAt:
            new Date(),
        });
      } catch (
        moderationError
      ) {
        console.error(
          "Malicious link moderation history error:",
          moderationError
        );
      }

      try {
        await CommentHistory.create({
          commentId:
            blockedComment._id,

          videoId:
            blockedComment.videoid,

          userId:
            blockedComment.userid,

          actorUserId:
            authenticatedUserId,

          action:
            "blocked",

          oldCommentBody:
            null,

          newCommentBody:
            null,

          reason:
            "malicious_link",

          moderationStatus:
            "blocked",

          actionAt:
            new Date(),
        });
      } catch (
        historyError
      ) {
        console.error(
          "Malicious link history error:",
          historyError
        );
      }

      return res.status(400).json({
        comment:
          false,

        blocked:
          true,

        maliciousLink:
          true,

        message:
          "Your comment was blocked because it contains a suspicious or unsafe link.",
      });
    }

    // =================================================
    // SPAM / SPECIAL / EMOJI CHECK
    // =================================================

    const spamResult =
      detectSpam(
        trimmedComment
      );

    if (
      spamResult.isSpam
    ) {
      const moderationSource =
        getModerationSource(
          spamResult.reason
        );

      const blockedComment =
        new comment({
          userid:
            authenticatedUserId,

          videoid,

          commentbody:
            trimmedComment,

          usercommented:
            currentUser.name ||
            "Anonymous",

          commentedon:
            new Date(),

          userimage:
            currentUser.image ||
            "",

          parentCommentId:
            parentComment
              ? parentComment._id
              : null,

          isEdited:
            false,

          editedAt:
            null,

          editDeadline:
            new Date(
              Date.now() +
                getCommentEditWindowMinutes() *
                  60 *
                  1000
            ),

          moderationStatus:
            "blocked",

          moderationReason:
            spamResult.reason,

          deletedAt:
            null,

          likeCount:
            0,

          dislikeCount:
            0,
        });

      await blockedComment.save();

      try {
        await CommentModeration.create({
          commentId:
            blockedComment._id,

          videoId:
            blockedComment.videoid,

          userId:
            blockedComment.userid,

          source:
            moderationSource,

          reason:
            spamResult.reason,

          action:
            "blocked",

          status:
            "completed",

          note:
            "Comment blocked by comment safety detection.",

          metadata:
            spamResult.metadata,

          detectedAt:
            new Date(),

          resolvedAt:
            new Date(),
        });
      } catch (
        moderationError
      ) {
        console.error(
          "Spam moderation history error:",
          moderationError
        );
      }

      try {
        await CommentHistory.create({
          commentId:
            blockedComment._id,

          videoId:
            blockedComment.videoid,

          userId:
            blockedComment.userid,

          actorUserId:
            authenticatedUserId,

          action:
            "blocked",

          oldCommentBody:
            null,

          newCommentBody:
            null,

          reason:
            spamResult.reason,

          moderationStatus:
            "blocked",

          actionAt:
            new Date(),
        });
      } catch (
        historyError
      ) {
        console.error(
          "Spam comment history error:",
          historyError
        );
      }

      let message =
        "Your comment was blocked because it appears to be spam.";

      if (
        spamResult.reason ===
        "repeated_special_characters"
      ) {
        message =
          "Your comment was blocked because it contains excessive repeated special characters.";
      }

      if (
        spamResult.reason ===
        "repeated_emoji"
      ) {
        message =
          "Your comment was blocked because it contains excessive repeated emojis.";
      }

      return res.status(400).json({
        comment:
          false,

        blocked:
          true,

        spam:
          true,

        reason:
          spamResult.reason,

        message,
      });
    }

    // =================================================
    // DUPLICATE COMMENT CHECK
    // =================================================

    const normalizedNewComment =
      normalizeCommentText(
        trimmedComment
      );

    const existingUserComments =
      await comment
        .find(
          {
            userid:
              authenticatedUserId,

            videoid,

            deletedAt:
              null,

            moderationStatus: {
              $nin: [
                "blocked",
                "deleted",
              ],
            },
          },
          {
            commentbody:
              1,
          }
        )
        .lean();

    const duplicateComment =
      existingUserComments.find(
        (
          existingComment
        ) => {
          return (
            normalizeCommentText(
              existingComment.commentbody
            ) ===
            normalizedNewComment
          );
        }
      );

    if (
      duplicateComment
    ) {
      const blockedComment =
        new comment({
          userid:
            authenticatedUserId,

          videoid,

          commentbody:
            trimmedComment,

          usercommented:
            currentUser.name ||
            "Anonymous",

          commentedon:
            new Date(),

          userimage:
            currentUser.image ||
            "",

          parentCommentId:
            parentComment
              ? parentComment._id
              : null,

          isEdited:
            false,

          editedAt:
            null,

          editDeadline:
            new Date(
              Date.now() +
                getCommentEditWindowMinutes() *
                  60 *
                  1000
            ),

          moderationStatus:
            "blocked",

          moderationReason:
            "duplicate_comment",

          deletedAt:
            null,

          likeCount:
            0,

          dislikeCount:
            0,
        });

      await blockedComment.save();

      try {
        await CommentModeration.create({
          commentId:
            blockedComment._id,

          videoId:
            blockedComment.videoid,

          userId:
            blockedComment.userid,

          source:
            "duplicate_detection",

          reason:
            "duplicate_comment",

          action:
            "blocked",

          status:
            "completed",

          note:
            "Duplicate comment blocked.",

          metadata: {
            matchedCommentId:
              duplicateComment._id,
          },

          detectedAt:
            new Date(),

          resolvedAt:
            new Date(),
        });
      } catch (
        moderationError
      ) {
        console.error(
          "Duplicate moderation history error:",
          moderationError
        );
      }

      try {
        await CommentHistory.create({
          commentId:
            blockedComment._id,

          videoId:
            blockedComment.videoid,

          userId:
            blockedComment.userid,

          actorUserId:
            authenticatedUserId,

          action:
            "blocked",

          oldCommentBody:
            null,

          newCommentBody:
            null,

          reason:
            "duplicate_comment",

          moderationStatus:
            "blocked",

          actionAt:
            new Date(),
        });
      } catch (
        historyError
      ) {
        console.error(
          "Duplicate comment history error:",
          historyError
        );
      }

      return res.status(400).json({
        comment:
          false,

        blocked:
          true,

        duplicate:
          true,

        message:
          "Duplicate comments are not allowed.",
      });
    }

    // =================================================
    // CALCULATE DATES
    // =================================================

    const commentedon =
      new Date();

    const editWindowMinutes =
      getCommentEditWindowMinutes();

    const editDeadline =
      new Date(
        commentedon.getTime() +
          editWindowMinutes *
            60 *
            1000
      );

    // =================================================
    // CREATE NORMAL COMMENT
    // =================================================

    const newComment =
      new comment({
        userid:
          authenticatedUserId,

        videoid,

        commentbody:
          trimmedComment,

        usercommented:
          currentUser.name ||
          "Anonymous",

        commentedon,

        userimage:
          currentUser.image ||
          "",

        parentCommentId:
          parentComment
            ? parentComment._id
            : null,

        isEdited:
          false,

        editedAt:
          null,

        editDeadline,

        moderationStatus:
          "approved",

        moderationReason:
          null,

        deletedAt:
          null,

        likeCount:
          0,

        dislikeCount:
          0,
      });

    await newComment.save();

    // -----------------------------------------
    // Creation history
    // -----------------------------------------

    try {
      await CommentHistory.create({
        commentId:
          newComment._id,

        videoId:
          newComment.videoid,

        userId:
          newComment.userid,

        actorUserId:
          authenticatedUserId,

        action:
          "created",

        oldCommentBody:
          null,

        newCommentBody:
          newComment.commentbody,

        moderationStatus:
          newComment.moderationStatus,

        actionAt:
          commentedon,
      });
    } catch (
      historyError
    ) {
      console.error(
        "Comment creation history error:",
        historyError
      );
    }

    // -----------------------------------------
    // Successful comment security event
    // -----------------------------------------

    try {
      await CommentSecurity.create({
        userId:
          authenticatedUserId,

        videoId:
          videoid,

        ipAddress:
          getClientIp(req),

        userAgent:
          req.headers[
            "user-agent"
          ] ||
          "Unknown",

        eventType:
          "comment_allowed",

        reason:
          "none",

        captchaRequired:
          rateLimitResult.captchaPassed ||
          false,

        captchaPassed:
          rateLimitResult.captchaPassed ||
          false,

        attemptCount:
          rateLimitResult.attemptCount,

        windowStartedAt:
          new Date(
            Date.now() -
              COMMENT_RATE_WINDOW_MS
          ),

        windowExpiresAt:
          new Date(
            Date.now() +
              COMMENT_RATE_WINDOW_MS
          ),

        metadata: {
          remainingAttempts:
            rateLimitResult.remaining,

          captchaUsed:
            rateLimitResult.captchaPassed ||
            false,
        },

        eventAt:
          new Date(),
      });
    } catch (
      securityError
    ) {
      console.error(
        "Allowed comment security logging error:",
        securityError
      );
    }

    return res.status(200).json({
      comment:
        true,

      data:
        newComment,
    });
  } catch (error) {
    console.error(
      "Post comment error:",
      error
    );

    return res.status(500).json({
      message:
        "Something went wrong",
    });
  }
};

// =====================================================
// GET ALL COMMENTS
// =====================================================

export const getallcomment = async (
  req,
  res
) => {
  const {
    videoid,
  } = req.params;

  if (
    !isValidVideoId(
      videoid
    )
  ) {
    return res.status(400).json({
      message:
        "Invalid video ID.",
    });
  }

  try {
    const commentvideo =
      await comment
        .find({
          videoid,

          deletedAt:
            null,

          moderationStatus: {
            $nin: [
              "blocked",
              "deleted",
            ],
          },
        })
        .sort({
          commentedon:
            -1,
        });

    return res.status(200).json(
      commentvideo
    );
  } catch (error) {
    console.error(
      "Get comments error:",
      error
    );

    return res.status(500).json({
      message:
        "Something went wrong",
    });
  }
};

// =====================================================
// DELETE COMMENT
// =====================================================

export const deletecomment = async (
  req,
  res
) => {
  const {
    id: _id,
  } = req.params;

  if (
    !isValidCommentId(
      _id
    )
  ) {
    return res.status(404).json({
      message:
        "Comment unavailable.",
    });
  }

  const authenticatedUserId =
    getAuthenticatedUserId(
      req
    );

  if (
    !authenticatedUserId
  ) {
    return res.status(401).json({
      message:
        "Security session is required.",
    });
  }

  try {
    const existingComment =
      await comment.findOne({
        _id,

        userid:
          authenticatedUserId,

        deletedAt:
          null,
      });

    if (
      !existingComment
    ) {
      return res.status(404).json({
        message:
          "Comment not found or you are not allowed to delete this comment.",
      });
    }

    try {
      await CommentHistory.create({
        commentId:
          existingComment._id,

        videoId:
          existingComment.videoid,

        userId:
          existingComment.userid,

        actorUserId:
          authenticatedUserId,

        action:
          "deleted",

        oldCommentBody:
          existingComment.commentbody,

        newCommentBody:
          null,

        moderationStatus:
          "deleted",

        actionAt:
          new Date(),
      });
    } catch (
      historyError
    ) {
      console.error(
        "Comment deletion history error:",
        historyError
      );
    }

    existingComment.deletedAt =
      new Date();

    existingComment.moderationStatus =
      "deleted";

    existingComment.moderationReason =
      "deleted_by_owner";

    await existingComment.save();

    return res.status(200).json({
      comment:
        true,
    });
  } catch (error) {
    console.error(
      "Delete comment error:",
      error
    );

    return res.status(500).json({
      message:
        "Something went wrong",
    });
  }
};

// =====================================================
// EDIT COMMENT
// =====================================================

export const editcomment = async (
  req,
  res
) => {
  const {
    id: _id,
  } = req.params;

  const {
    commentbody,
  } = req.body;

  if (
    !isValidCommentId(
      _id
    )
  ) {
    return res.status(404).json({
      message:
        "Comment unavailable.",
    });
  }

  const authenticatedUserId =
    getAuthenticatedUserId(
      req
    );

  if (
    !authenticatedUserId
  ) {
    return res.status(401).json({
      message:
        "Security session is required.",
    });
  }

  if (
    typeof commentbody !==
      "string" ||
    !commentbody.trim()
  ) {
    return res.status(400).json({
      message:
        "Comment cannot be empty.",
    });
  }

  const trimmedComment =
    commentbody.trim();

  if (
    trimmedComment.length >
    2000
  ) {
    return res.status(400).json({
      message:
        "Comment is too long. Maximum 2000 characters are allowed.",
    });
  }

  try {
    const existingComment =
      await comment.findOne({
        _id,

        userid:
          authenticatedUserId,

        deletedAt:
          null,
      });

    if (
      !existingComment
    ) {
      return res.status(404).json({
        message:
          "Comment not found or you are not allowed to edit this comment.",
      });
    }

    // -----------------------------------------
    // Determine deadline
    // -----------------------------------------

    let editDeadline =
      existingComment.editDeadline;

    if (!editDeadline) {
      const commentedDate =
        existingComment.commentedon ||
        existingComment.createdAt;

      if (
        commentedDate
      ) {
        editDeadline =
          new Date(
            new Date(
              commentedDate
            ).getTime() +
              getCommentEditWindowMinutes() *
                60 *
                1000
          );
      }
    }

    // -----------------------------------------
    // Check time limit
    // -----------------------------------------

    if (
      !editDeadline ||
      new Date() >
        new Date(
          editDeadline
        )
    ) {
      return res.status(403).json({
        message:
          "The edit time limit for this comment has expired.",
      });
    }

    // =================================================
    // PROFANITY CHECK ON EDIT
    // =================================================

    const profanityDetected =
      containsProfanity(
        trimmedComment
      );

    if (
      profanityDetected
    ) {
      try {
        await CommentModeration.create({
          commentId:
            existingComment._id,

          videoId:
            existingComment.videoid,

          userId:
            existingComment.userid,

          source:
            "profanity_filter",

          reason:
            "profanity",

          action:
            "blocked",

          status:
            "completed",

          note:
            "Comment edit blocked by profanity filter.",

          metadata: {
            filter:
              "badwords-filter",

            attemptedEdit:
              true,
          },

          detectedAt:
            new Date(),

          resolvedAt:
            new Date(),
        });
      } catch (
        moderationError
      ) {
        console.error(
          "Comment edit moderation history error:",
          moderationError
        );
      }

      return res.status(400).json({
        message:
          "Your edited comment was blocked because it contains inappropriate language.",
      });
    }

    // =================================================
    // MALICIOUS LINK CHECK ON EDIT
    // =================================================

    const maliciousLinkResult =
      detectMaliciousLinks(
        trimmedComment
      );

    if (
      maliciousLinkResult.isMalicious
    ) {
      try {
        await CommentModeration.create({
          commentId:
            existingComment._id,

          videoId:
            existingComment.videoid,

          userId:
            existingComment.userid,

          source:
            "malicious_link_detection",

          reason:
            "malicious_link",

          action:
            "blocked",

          status:
            "completed",

          note:
            "Comment edit blocked because a suspicious or unsafe link pattern was detected.",

          metadata: {
            ...maliciousLinkResult.metadata,

            attemptedEdit:
              true,
          },

          detectedAt:
            new Date(),

          resolvedAt:
            new Date(),
        });
      } catch (
        moderationError
      ) {
        console.error(
          "Malicious link edit moderation history error:",
          moderationError
        );
      }

      return res.status(400).json({
        message:
          "Your edited comment was blocked because it contains a suspicious or unsafe link.",
      });
    }

    // =================================================
    // SPAM / SPECIAL / EMOJI CHECK ON EDIT
    // =================================================

    const spamResult =
      detectSpam(
        trimmedComment
      );

    if (
      spamResult.isSpam
    ) {
      const moderationSource =
        getModerationSource(
          spamResult.reason
        );

      try {
        await CommentModeration.create({
          commentId:
            existingComment._id,

          videoId:
            existingComment.videoid,

          userId:
            existingComment.userid,

          source:
            moderationSource,

          reason:
            spamResult.reason,

          action:
            "blocked",

          status:
            "completed",

          note:
            "Comment edit blocked by comment safety detection.",

          metadata: {
            ...spamResult.metadata,

            attemptedEdit:
              true,
          },

          detectedAt:
            new Date(),

          resolvedAt:
            new Date(),
        });
      } catch (
        moderationError
      ) {
        console.error(
          "Spam edit moderation history error:",
          moderationError
        );
      }

      let message =
        "Your edited comment was blocked because it appears to be spam.";

      if (
        spamResult.reason ===
        "repeated_special_characters"
      ) {
        message =
          "Your edited comment was blocked because it contains excessive repeated special characters.";
      }

      if (
        spamResult.reason ===
        "repeated_emoji"
      ) {
        message =
          "Your edited comment was blocked because it contains excessive repeated emojis.";
      }

      return res.status(400).json({
        message,
      });
    }

    // =================================================
    // DUPLICATE CHECK ON EDIT
    // =================================================

    const normalizedEditedComment =
      normalizeCommentText(
        trimmedComment
      );

    const existingUserComments =
      await comment
        .find(
          {
            userid:
              authenticatedUserId,

            videoid:
              existingComment.videoid,

            deletedAt:
              null,

            moderationStatus: {
              $nin: [
                "blocked",
                "deleted",
              ],
            },

            _id: {
              $ne:
                existingComment._id,
            },
          },
          {
            commentbody:
              1,
          }
        )
        .lean();

    const duplicateComment =
      existingUserComments.find(
        (
          existingUserComment
        ) => {
          return (
            normalizeCommentText(
              existingUserComment.commentbody
            ) ===
            normalizedEditedComment
          );
        }
      );

    if (
      duplicateComment
    ) {
      try {
        await CommentModeration.create({
          commentId:
            existingComment._id,

          videoId:
            existingComment.videoid,

          userId:
            existingComment.userid,

          source:
            "duplicate_detection",

          reason:
            "duplicate_comment",

          action:
            "blocked",

          status:
            "completed",

          note:
            "Comment edit blocked because it duplicates another comment.",

          metadata: {
            matchedCommentId:
              duplicateComment._id,

            attemptedEdit:
              true,
          },

          detectedAt:
            new Date(),

          resolvedAt:
            new Date(),
        });
      } catch (
        moderationError
      ) {
        console.error(
          "Duplicate edit moderation history error:",
          moderationError
        );
      }

      return res.status(400).json({
        message:
          "Your edited comment would create a duplicate comment.",
      });
    }

    // -----------------------------------------
    // Save old body
    // -----------------------------------------

    const oldCommentBody =
      existingComment.commentbody;

    // -----------------------------------------
    // Update comment
    // -----------------------------------------

    existingComment.commentbody =
      trimmedComment;

    existingComment.isEdited =
      true;

    existingComment.editedAt =
      new Date();

    existingComment.editDeadline =
      editDeadline;

    await existingComment.save();

    // -----------------------------------------
    // Edit history
    // -----------------------------------------

    try {
      await CommentHistory.create({
        commentId:
          existingComment._id,

        videoId:
          existingComment.videoid,

        userId:
          existingComment.userid,

        actorUserId:
          authenticatedUserId,

        action:
          "edited",

        oldCommentBody,

        newCommentBody:
          existingComment.commentbody,

        moderationStatus:
          existingComment.moderationStatus ||
          "approved",

        actionAt:
          existingComment.editedAt ||
          new Date(),
      });
    } catch (
      historyError
    ) {
      console.error(
        "Comment edit history error:",
        historyError
      );
    }

    return res.status(200).json(
      existingComment
    );
  } catch (error) {
    console.error(
      "Edit comment error:",
      error
    );

    return res.status(500).json({ 
      message:
        "Something went wrong",
    });
  }
};