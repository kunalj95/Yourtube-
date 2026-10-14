import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "./ui/avatar";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { formatDistanceToNow } from "date-fns";
import {
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

interface Comment {
  _id: string;
  videoid: string;
  userid: string;
  commentbody: string;
  usercommented: string;
  commentedon: string;
  userimage?: string;
  likeCount?: number;
  dislikeCount?: number;
  parentCommentId?: string | null;

  // Edit / delete time-limit fields
  editDeadline?: string | null;
  isEdited?: boolean;
  editedAt?: string | null;
}

interface ReactionState {
  reaction:
    | "like"
    | "dislike"
    | null;

  likeCount: number;
  dislikeCount: number;
}

interface TranslationState {
  translatedText: string;
  sourceLanguage: string | null;
  targetLanguage: string;
}

type SortOption =
  | "newest"
  | "oldest"
  | "mostLiked"
  | "mostRelevant";

interface TurnstileInstance {
  render: (
    container:
      | HTMLElement
      | string,
    options: {
      sitekey: string;
      theme?: "light" | "dark" | "auto";
      callback?: (
        token: string
      ) => void;
      "error-callback"?: (
        errorCode?: string
      ) => void;
      "expired-callback"?: () => void;
      "timeout-callback"?: () => void;
    }
  ) => string;

  reset: (
    widgetId?: string
  ) => void;

  remove: (
    widgetId?: string
  ) => void;

  getResponse: (
    widgetId?: string
  ) => string;
}

declare global {
  interface Window {
    turnstile?: TurnstileInstance;
  }
}

const Comments = ({ videoId }: any) => {
  const [comments, setComments] =
    useState<Comment[]>([]);

  const [newComment, setNewComment] =
    useState("");

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [
    editingCommentId,
    setEditingCommentId,
  ] = useState<string | null>(null);

  const [editText, setEditText] =
    useState("");

  const [reactions, setReactions] =
    useState<
      Record<
        string,
        ReactionState
      >
    >({});

  const [
    reactionLoading,
    setReactionLoading,
  ] = useState<
    Record<string, boolean>
  >({});

  const [replyingTo, setReplyingTo] =
    useState<string | null>(null);

  const [replyText, setReplyText] =
    useState("");

  const [
    isReplySubmitting,
    setIsReplySubmitting,
  ] = useState(false);

  const [loading, setLoading] =
    useState(true);

  // Used to refresh edit/delete availability
  const [currentTime, setCurrentTime] =
    useState(Date.now());

  // Comment sorting
  const [sortOption, setSortOption] =
    useState<SortOption>("newest");

  // =====================================================
  // TRANSLATION STATE
  // =====================================================

  const [
    translations,
    setTranslations,
  ] = useState<
    Record<string, TranslationState>
  >({});

  const [
    translationLoading,
    setTranslationLoading,
  ] = useState<
    Record<string, boolean>
  >({});

  const [
    showTranslation,
    setShowTranslation,
  ] = useState<
    Record<string, boolean>
  >({});

  // =====================================================
  // CAPTCHA STATE
  // =====================================================

  const [
    captchaRequired,
    setCaptchaRequired,
  ] = useState(false);

  const [
    captchaToken,
    setCaptchaToken,
  ] = useState<string | null>(
    null
  );

  const captchaContainerRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const captchaWidgetIdRef =
    useRef<string | null>(null);

  const {
    user,
  } = useUser();

  const turnstileSiteKey =
    process.env
      .NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  // =====================================================
  // COMMENT REPORT STATE
  // =====================================================

  const [
    reportCommentId,
    setReportCommentId,
  ] = useState<string | null>(null);

  const [
    reportReason,
    setReportReason,
  ] = useState<
    | "spam"
    | "harassment"
    | "offensive_content"
    | "malicious_link"
    | "other"
  >("spam");

  const [
    reportDetails,
    setReportDetails,
  ] = useState("");

  const [
    reportSubmitting,
    setReportSubmitting,
  ] = useState(false);

  // =====================================================
  // CAPTCHA RESET
  // =====================================================

  const resetCaptcha = () => {
    try {
      if (
        window.turnstile &&
        captchaWidgetIdRef.current
      ) {
        window.turnstile.reset(
          captchaWidgetIdRef.current
        );
      }
    } catch (error) {
      console.error(
        "Turnstile reset error:",
        error
      );
    }

    setCaptchaToken(null);
  };

  // =====================================================
  // CAPTCHA REMOVE
  // =====================================================

  const removeCaptcha = () => {
    try {
      if (
        window.turnstile &&
        captchaWidgetIdRef.current
      ) {
        window.turnstile.remove(
          captchaWidgetIdRef.current
        );
      }
    } catch (error) {
      console.error(
        "Turnstile remove error:",
        error
      );
    }

    captchaWidgetIdRef.current =
      null;

    setCaptchaToken(null);
  };

  // =====================================================
  // CAPTCHA SCRIPT + WIDGET
  // =====================================================

  useEffect(() => {
    if (
      !captchaRequired
    ) {
      removeCaptcha();
      return;
    }

    if (
      !turnstileSiteKey
    ) {
      console.error(
        "NEXT_PUBLIC_TURNSTILE_SITE_KEY is missing."
      );

      window.alert(
        "CAPTCHA configuration is missing. Please check your frontend .env.local file."
      );

      return;
    }

    const renderCaptcha = () => {
      if (
        !window.turnstile ||
        !captchaContainerRef.current
      ) {
        return;
      }

      // Prevent duplicate widgets.
      if (
        captchaWidgetIdRef.current
      ) {
        return;
      }

      captchaContainerRef.current.innerHTML =
        "";

      try {
        const widgetId =
          window.turnstile.render(
            captchaContainerRef.current,
            {
              sitekey:
                turnstileSiteKey,

              theme: "auto",

              callback:
                (
                  token: string
                ) => {
                  setCaptchaToken(
                    token
                  );
                },

              "error-callback":
                (
                  errorCode?: string
                ) => {
                  console.error(
                    "Turnstile error:",
                    errorCode
                  );

                  setCaptchaToken(
                    null
                  );

                  window.alert(
                    "CAPTCHA could not be completed. Please try again."
                  );
                },

              "expired-callback":
                () => {
                  setCaptchaToken(
                    null
                  );

                  window.alert(
                    "CAPTCHA expired. Please complete it again."
                  );
                },

              "timeout-callback":
                () => {
                  setCaptchaToken(
                    null
                  );

                  window.alert(
                    "CAPTCHA timed out. Please try again."
                  );
                },
            }
          );

        captchaWidgetIdRef.current =
          widgetId;
      } catch (error) {
        console.error(
          "Turnstile render error:",
          error
        );
      }
    };

    // Turnstile already loaded.
    if (
      window.turnstile
    ) {
      renderCaptcha();
      return;
    }

    // Check whether the script is already
    // being loaded by another render.
    const existingScript =
      document.getElementById(
        "cloudflare-turnstile-script"
      );

    if (
      existingScript
    ) {
      existingScript.addEventListener(
        "load",
        renderCaptcha
      );

      return () => {
        existingScript.removeEventListener(
          "load",
          renderCaptcha
        );
      };
    }

    // Load Turnstile explicitly.
    const script =
      document.createElement(
        "script"
      );

    script.id =
      "cloudflare-turnstile-script";

    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

    script.async = true;
    script.defer = true;

    script.onload =
      renderCaptcha;

    script.onerror = () => {
      console.error(
        "Failed to load Cloudflare Turnstile."
      );

      window.alert(
        "Unable to load CAPTCHA. Please check your internet connection and try again."
      );
    };

    document.head.appendChild(
      script
    );

    return () => {
      script.onload = null;
    };
  }, [
    captchaRequired,
    turnstileSiteKey,
  ]);

  // =====================================================
  // REFRESH CURRENT TIME
  // =====================================================

  useEffect(() => {
    const interval =
      setInterval(() => {
        setCurrentTime(
          Date.now()
        );
      }, 1000);

    return () => {
      clearInterval(
        interval
      );
    };
  }, []);

  // =====================================================
  // LOAD COMMENTS
  // =====================================================

  useEffect(() => {
    loadComments();
  }, [videoId]);

  const loadComments =
    async () => {
      try {
        const res =
          await axiosInstance.get(
            `/comment/${videoId}`
          );

        const fetchedComments:
          Comment[] =
          res.data || [];

        setComments(
          fetchedComments
        );

        if (
          user &&
          fetchedComments.length >
            0
        ) {
          const reactionResults =
            await Promise.all(
              fetchedComments.map(
                async (
                  comment
                ) => {
                  try {
                    const reactionRes =
                      await axiosInstance.get(
                        `/comment/reaction/${comment._id}`
                      );

                    return {
                      commentId:
                        comment._id,

                      reaction:
                        reactionRes
                          .data
                          ?.reaction ||
                        null,

                      likeCount:
                        reactionRes
                          .data
                          ?.likeCount ||
                        0,

                      dislikeCount:
                        reactionRes
                          .data
                          ?.dislikeCount ||
                        0,
                    };
                  } catch (
                    error
                  ) {
                    console.log(
                      `Could not load reaction for comment ${comment._id}`,
                      error
                    );

                    return {
                      commentId:
                        comment._id,

                      reaction:
                        null,

                      likeCount:
                        comment.likeCount ||
                        0,

                      dislikeCount:
                        comment.dislikeCount ||
                        0,
                    };
                  }
                }
              )
            );

          const reactionMap:
            Record<
              string,
              ReactionState
            > = {};

          reactionResults.forEach(
            (
              item
            ) => {
              reactionMap[
                item.commentId
              ] = {
                reaction:
                  item.reaction,

                likeCount:
                  item.likeCount,

                dislikeCount:
                  item.dislikeCount,
              };
            }
          );

          setReactions(
            reactionMap
          );
        } else {
          const reactionMap:
            Record<
              string,
              ReactionState
            > = {};

          fetchedComments.forEach(
            (
              comment
            ) => {
              reactionMap[
                comment._id
              ] = {
                reaction:
                  null,

                likeCount:
                  comment.likeCount ||
                  0,

                dislikeCount:
                  comment.dislikeCount ||
                  0,
              };
            }
          );

          setReactions(
            reactionMap
          );
        }
      } catch (error) {
        console.log(
          "Error loading comments:",
          error
        );
      } finally {
        setLoading(false);
      }
    };

  // =====================================================
  // CHECK COMMENT TIME LIMIT
  // =====================================================

  const isWithinCommentTimeLimit =
    (
      comment: Comment
    ) => {
      if (
        !comment.editDeadline
      ) {
        return false;
      }

      const deadline =
        new Date(
          comment.editDeadline
        ).getTime();

      return (
        currentTime <
        deadline
      );
    };

  // =====================================================
  // SUBMIT NEW COMMENT
  // =====================================================

  const handleSubmitComment =
    async () => {
      if (
        !user ||
        !newComment.trim()
      ) {
        return;
      }

      // -----------------------------------------
      // CAPTCHA required but not completed
      // -----------------------------------------

      if (
        captchaRequired &&
        !captchaToken
      ) {
        window.alert(
          "Please complete the CAPTCHA verification before posting your comment."
        );

        return;
      }

      setIsSubmitting(true);

      try {
        const res =
          await axiosInstance.post(
            "/comment/postcomment",
            {
              videoid:
                videoId,

              userid:
                user._id,

              commentbody:
                newComment,

              usercommented:
                user.name,

              turnstileToken:
                captchaToken,
            }
          );

        if (
          res.data.comment
        ) {
          const newCommentObj:
            Comment = {
              _id:
                res.data.data
                  ?._id ||
                Date.now().toString(),

              videoid:
                videoId,

              userid:
                user._id,

              commentbody:
                res.data.data
                  ?.commentbody ||
                newComment,

              usercommented:
                user.name ||
                "Anonymous",

              commentedon:
                res.data.data
                  ?.commentedon ||
                new Date().toISOString(),

              userimage:
                user.image ||
                "",

              likeCount:
                0,

              dislikeCount:
                0,

              parentCommentId:
                null,

              editDeadline:
                res.data.data
                  ?.editDeadline ||
                null,

              isEdited:
                false,

              editedAt:
                null,
            };

          setComments(
            (
              prev
            ) => [
              newCommentObj,
              ...prev,
            ]
          );

          setReactions(
            (
              prev
            ) => ({
              ...prev,

              [newCommentObj._id]:
                {
                  reaction:
                    null,

                  likeCount:
                    0,

                  dislikeCount:
                    0,
                },
            })
          );

          setNewComment("");

          // CAPTCHA tokens are single-use,
          // so reset after successful use.
          if (
            captchaRequired
          ) {
            removeCaptcha();

            setCaptchaRequired(
              false
            );
          }
        }
      } catch (
        error: any
      ) {
        const status =
          error?.response?.status;

        // -----------------------------------------
        // CAPTCHA is required
        // -----------------------------------------

        if (
          status === 403 &&
          error?.response
            ?.data
            ?.captchaRequired
        ) {
          setCaptchaRequired(
            true
          );

          setCaptchaToken(
            null
          );

          window.alert(
            "Please complete the CAPTCHA verification before posting another comment."
          );

          return;
        }

        // -----------------------------------------
        // CAPTCHA failed
        // -----------------------------------------

        if (
          status === 403 &&
          error?.response
            ?.data
            ?.captchaFailed
        ) {
          resetCaptcha();

          window.alert(
            "CAPTCHA verification failed. Please try again."
          );

          return;
        }

        // -----------------------------------------
        // Other errors
        // -----------------------------------------

        console.error(
          "Error adding comment:",
          error
        );

        const backendMessage =
          error?.response
            ?.data
            ?.message;

        window.alert(
          typeof backendMessage ===
            "string"
            ? backendMessage
            : "Unable to add your comment. Please try again."
        );
      } finally {
        setIsSubmitting(
          false
        );
      }
    };

  // =====================================================
  // REPLY
  // =====================================================

  const handleReply =
    async (
      parentCommentId: string
    ) => {
      if (
        !user ||
        !replyText.trim()
      ) {
        return;
      }

      // -----------------------------------------
      // CAPTCHA required
      // -----------------------------------------

      if (
        captchaRequired &&
        !captchaToken
      ) {
        window.alert(
          "Please complete the CAPTCHA verification before posting your reply."
        );

        return;
      }

      setIsReplySubmitting(
        true
      );

      try {
        const res =
          await axiosInstance.post(
            "/comment/postcomment",
            {
              videoid:
                videoId,

              userid:
                user._id,

              commentbody:
                replyText,

              usercommented:
                user.name,

              parentCommentId:
                parentCommentId,

              turnstileToken:
                captchaToken,
            }
          );

        if (
          res.data.comment
        ) {
          const newReply:
            Comment = {
              _id:
                res.data.data
                  ?._id ||
                Date.now().toString(),

              videoid:
                videoId,

              userid:
                user._id,

              commentbody:
                res.data.data
                  ?.commentbody ||
                replyText,

              usercommented:
                user.name ||
                "Anonymous",

              commentedon:
                res.data.data
                  ?.commentedon ||
                new Date().toISOString(),

              userimage:
                user.image ||
                "",

              likeCount:
                0,

              dislikeCount:
                0,

              parentCommentId:
                parentCommentId,

              editDeadline:
                res.data.data
                  ?.editDeadline ||
                null,

              isEdited:
                false,

              editedAt:
                null,
            };

          setComments(
            (
              prev
            ) => [
              ...prev,
              newReply,
            ]
          );

          setReactions(
            (
              prev
            ) => ({
              ...prev,

              [newReply._id]:
                {
                  reaction:
                    null,

                  likeCount:
                    0,

                  dislikeCount:
                    0,
                },
            })
          );

          setReplyText("");
          setReplyingTo(null);

          if (
            captchaRequired
          ) {
            removeCaptcha();

            setCaptchaRequired(
              false
            );
          }
        }
      } catch (
        error: any
      ) {
        const status =
          error?.response?.status;

        // -----------------------------------------
        // CAPTCHA required
        // -----------------------------------------

        if (
          status === 403 &&
          error?.response
            ?.data
            ?.captchaRequired
        ) {
          setCaptchaRequired(
            true
          );

          setCaptchaToken(
            null
          );

          window.alert(
            "Please complete the CAPTCHA verification before posting another comment."
          );

          return;
        }

        // -----------------------------------------
        // CAPTCHA failed
        // -----------------------------------------

        if (
          status === 403 &&
          error?.response
            ?.data
            ?.captchaFailed
        ) {
          resetCaptcha();

          window.alert(
            "CAPTCHA verification failed. Please try again."
          );

          return;
        }

        console.error(
          "Error adding reply:",
          error
        );

        const backendMessage =
          error?.response
            ?.data
            ?.message;

        window.alert(
          typeof backendMessage ===
            "string"
            ? backendMessage
            : "Unable to add your reply. Please try again."
        );
      } finally {
        setIsReplySubmitting(
          false
        );
      }
    };

  // =====================================================
  // START EDIT
  // =====================================================

  const handleEdit = (
    comment: Comment
  ) => {
    if (
      !isWithinCommentTimeLimit(
        comment
      )
    ) {
      return;
    }

    setEditingCommentId(
      comment._id
    );

    setEditText(
      comment.commentbody
    );
  };

  // =====================================================
  // UPDATE COMMENT
  // =====================================================

  const handleUpdateComment =
    async () => {
      if (
        !editText.trim() ||
        !editingCommentId
      ) {
        return;
      }

      const editingComment =
        comments.find(
          (
            comment
          ) =>
            comment._id ===
            editingCommentId
        );

      if (
        !editingComment
      ) {
        return;
      }

      if (
        !isWithinCommentTimeLimit(
          editingComment
        )
      ) {
        setEditingCommentId(
          null
        );

        setEditText("");

        return;
      }

      try {
        const res =
          await axiosInstance.post(
            `/comment/editcomment/${editingCommentId}`,
            {
              commentbody:
                editText,
            }
          );

        if (
          res.data
        ) {
          const editedTime =
            new Date().toISOString();

          setComments(
            (
              prev
            ) =>
              prev.map(
                (
                  c
                ) =>
                  c._id ===
                  editingCommentId
                    ? {
                        ...c,

                        commentbody:
                          res.data
                            ?.commentbody ||
                          editText,

                        isEdited:
                          true,

                        editedAt:
                          res.data
                            ?.editedAt ||
                          editedTime,
                      }
                    : c
              )
          );

          setTranslations(
            (
              prev
            ) => {
              const updated = {
                ...prev,
              };

              delete updated[
                editingCommentId
              ];

              return updated;
            }
          );

          setShowTranslation(
            (
              prev
            ) => {
              const updated = {
                ...prev,
              };

              delete updated[
                editingCommentId
              ];

              return updated;
            }
          );

          setEditingCommentId(
            null
          );

          setEditText("");
        }
      } catch (
        error: any
      ) {
        const status =
          error?.response?.status;

        if (
          status === 400
        ) {
          const message =
            error?.response
              ?.data
              ?.message ||
            "Your edited comment could not be saved.";

          window.alert(
            message
          );
        } else {
          console.log(
            "Error updating comment:",
            error
          );

          window.alert(
            "Unable to update your comment. Please try again."
          );
        }
      }
    };

  // =====================================================
  // DELETE COMMENT
  // =====================================================

  const handleDelete = async (
    id: string
  ) => {
    const commentToDelete =
      comments.find(
        (
          comment
        ) =>
          comment._id === id
      );

    if (
      !commentToDelete
    ) {
      return;
    }

    if (
      !isWithinCommentTimeLimit(
        commentToDelete
      )
    ) {
      return;
    }

    try {
      const res =
        await axiosInstance.delete(
          `/comment/deletecomment/${id}`
        );

      if (
        res.data.comment
      ) {
        setComments(
          (
            prev
          ) =>
            prev.filter(
              (
                c
              ) =>
                c._id !==
                id
            )
        );

        setReactions(
          (
            prev
          ) => {
            const updated = {
              ...prev,
            };

            delete updated[id];

            return updated;
          }
        );

        setTranslations(
          (
            prev
          ) => {
            const updated = {
              ...prev,
            };

            delete updated[id];

            return updated;
          }
        );

        setShowTranslation(
          (
            prev
          ) => {
            const updated = {
              ...prev,
            };

            delete updated[id];

            return updated;
          }
        );
      }
    } catch (
      error: any
    ) {
      console.log(
        "Error deleting comment:",
        error
      );

      window.alert(
        error?.response
          ?.data
          ?.message ||
        "Unable to delete the comment. Please try again."
      );
    }
  };

  // =====================================================
  // LIKE / DISLIKE
  // =====================================================

  const handleReaction =
    async (
      commentId: string,
      reaction:
        | "like"
        | "dislike"
    ) => {
      if (!user) {
        console.log(
          "Please login to react to a comment."
        );

        return;
      }

      if (
        reactionLoading[
          commentId
        ]
      ) {
        return;
      }

      setReactionLoading(
        (
          prev
        ) => ({
          ...prev,

          [commentId]:
            true,
        })
      );

      try {
        const res =
          await axiosInstance.post(
            `/comment/reaction/${commentId}`,
            {
              reaction,
            }
          );

        if (
          res.data
            ?.success
        ) {
          setReactions(
            (
              prev
            ) => ({
              ...prev,

              [commentId]:
                {
                  reaction:
                    res.data
                      .reaction ||
                    null,

                  likeCount:
                    res.data
                      .likeCount ||
                    0,

                  dislikeCount:
                    res.data
                      .dislikeCount ||
                    0,
                },
            })
          );
        }
      } catch (
        error
      ) {
        console.error(
          "Error reacting to comment:",
          error
        );
      } finally {
        setReactionLoading(
          (
            prev
          ) => ({
            ...prev,

            [commentId]:
              false,
          })
        );
      }
    };

  // =====================================================
  // TRANSLATE COMMENT
  // =====================================================

  const handleTranslate =
    async (
      comment: Comment
    ) => {
      if (!user) {
        console.log(
          "Please login to translate comments."
        );

        return;
      }

      if (
        translationLoading[
          comment._id
        ]
      ) {
        return;
      }

      const targetLanguage =
        (
          user as any
        )
          ?.preferredLanguage ||
        "en";

      if (
        translations[
          comment._id
        ]
      ) {
        setShowTranslation(
          (
            prev
          ) => ({
            ...prev,

            [comment._id]:
              true,
          })
        );

        return;
      }

      setTranslationLoading(
        (
          prev
        ) => ({
          ...prev,

          [comment._id]:
            true,
        })
      );

      try {
        const res =
          await axiosInstance.post(
            "/comment/translate",
            {
              text:
                comment.commentbody,

              sourceLanguage:
                "auto",

              targetLanguage:
                targetLanguage,
            }
          );

        if (
          res.data
            ?.success &&
          res.data
            ?.translatedText
        ) {
          setTranslations(
            (
              prev
            ) => ({
              ...prev,

              [comment._id]:
                {
                  translatedText:
                    res.data
                      .translatedText,

                  sourceLanguage:
                    res.data
                      .sourceLanguage ||
                    null,

                  targetLanguage:
                    res.data
                      .targetLanguage ||
                    targetLanguage,
                },
            })
          );

          setShowTranslation(
            (
              prev
            ) => ({
              ...prev,

              [comment._id]:
                true,
            })
          );
        }
      } catch (
        error
      ) {
        console.error(
          "Error translating comment:",
          error
        );
      } finally {
        setTranslationLoading(
          (
            prev
          ) => ({
            ...prev,

            [comment._id]:
              false,
          })
        );
      }
    };

  // =====================================================
  // HIDE TRANSLATION
  // =====================================================

  const handleShowOriginal = (
    commentId: string
  ) => {
    setShowTranslation(
      (
        prev
      ) => ({
        ...prev,

        [commentId]:
          false,
      })
    );
  };

  // =====================================================
  // REPORT COMMENT
  // =====================================================

  const handleReportComment =
    async () => {
      if (!user) {
        window.alert(
          "Please login to report a comment."
        );

        return;
      }

      if (!reportCommentId) {
        return;
      }

      if (
        reportDetails.trim().length >
        1000
      ) {
        window.alert(
          "Report details cannot exceed 1000 characters."
        );

        return;
      }

      setReportSubmitting(
        true
      );

      try {
        const res =
          await axiosInstance.post(
            `/comment/report/${reportCommentId}`,
            {
              reason:
                reportReason,

              details:
                reportDetails.trim(),
            }
          );

        if (
          res.data
            ?.report
        ) {
          window.alert(
            "Comment reported successfully."
          );

          setReportCommentId(
            null
          );

          setReportReason(
            "spam"
          );

          setReportDetails(
            ""
          );
        }
      } catch (
        error: any
      ) {
        console.error(
          "Error reporting comment:",
          error
        );

        const status =
          error?.response?.status;

        const backendMessage =
          error?.response
            ?.data
            ?.message;

        if (
          status === 409
        ) {
          window.alert(
            backendMessage ||
            "You have already reported this comment for this reason."
          );
        } else if (
          status === 401
        ) {
          window.alert(
            "Please login again before reporting a comment."
          );
        } else if (
          status === 404
        ) {
          window.alert(
            "This comment is no longer available."
          );
        } else {
          window.alert(
            typeof backendMessage ===
              "string"
              ? backendMessage
              : "Unable to report this comment. Please try again."
          );
        }
      } finally {
        setReportSubmitting(
          false
        );
      }
    };

  // =====================================================
  // SORT TOP LEVEL COMMENTS
  // =====================================================

  const getSortedTopLevelComments =
    () => {
      const topLevelComments =
        comments.filter(
          (
            comment
          ) =>
            !comment.parentCommentId ||
            !comments.some(
              (
                parent
              ) =>
                parent._id ===
                comment.parentCommentId
            )
        );

      const sortedComments =
        [
          ...topLevelComments,
        ];

      sortedComments.sort(
        (
          a,
          b
        ) => {
          const timeA =
            new Date(
              a.commentedon
            ).getTime();

          const timeB =
            new Date(
              b.commentedon
            ).getTime();

          const likesA =
            reactions[
              a._id
            ]
              ?.likeCount ??
            a.likeCount ??
            0;

          const likesB =
            reactions[
              b._id
            ]
              ?.likeCount ??
            b.likeCount ??
            0;

          const repliesA =
            comments.filter(
              (
                comment
              ) =>
                comment.parentCommentId ===
                a._id
            ).length;

          const repliesB =
            comments.filter(
              (
                comment
              ) =>
                comment.parentCommentId ===
                b._id
            ).length;

          if (
            sortOption ===
            "newest"
          ) {
            return (
              timeB -
              timeA
            );
          }

          if (
            sortOption ===
            "oldest"
          ) {
            return (
              timeA -
              timeB
            );
          }

          if (
            sortOption ===
            "mostLiked"
          ) {
            if (
              likesB !==
              likesA
            ) {
              return (
                likesB -
                likesA
              );
            }

            return (
              timeB -
              timeA
            );
          }

          if (
            sortOption ===
            "mostRelevant"
          ) {
            const relevanceA =
              likesA * 2 +
              repliesA * 3 +
              Math.max(
                0,
                1000000000 -
                  Math.floor(
                    (
                      currentTime -
                      timeA
                    ) /
                      1000
                  )
              );

            const relevanceB =
              likesB * 2 +
              repliesB * 3 +
              Math.max(
                0,
                1000000000 -
                  Math.floor(
                    (
                      currentTime -
                      timeB
                    ) /
                      1000
                  )
              );

            return (
              relevanceB -
              relevanceA
            );
          }

          return (
            timeB -
            timeA
          );
        }
      );

      return sortedComments;
    };

  // =====================================================
  // RENDER COMMENT
  // =====================================================

  const renderComment = (
    comment: Comment,
    isReply = false
  ) => {
    const reaction =
      reactions[
        comment._id
      ];

    const replies =
      comments.filter(
        (
          item
        ) =>
          item.parentCommentId ===
          comment._id
      );

    const userOwnsComment =
      comment.userid ===
      user?._id;

    const withinTimeLimit =
      isWithinCommentTimeLimit(
        comment
      );

    const translation =
      translations[
        comment._id
      ];

    const translationVisible =
      showTranslation[
        comment._id
      ];

    const isTranslating =
      translationLoading[
        comment._id
      ];

    return (
      <div
        key={
          comment._id
        }
        className={
          isReply
            ? "ml-12"
            : ""
        }
      >
        <div className="flex gap-4">
          <Avatar className="w-10 h-10">
            <AvatarImage
              src={
                comment.userimage ||
                "/placeholder.svg"
              }
            />

            <AvatarFallback>
              {
                comment
                  .usercommented?.[0] ||
                "U"
              }
            </AvatarFallback>
          </Avatar>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">
                {
                  comment.usercommented
                }
              </span>

              <span className="text-xs text-gray-600">
                {formatDistanceToNow(
                  new Date(
                    comment.commentedon
                  )
                )}{" "}
                ago
              </span>

              {comment.isEdited && (
                <span className="text-xs text-gray-500">
                  (edited)
                </span>
              )}
            </div>

            {editingCommentId ===
            comment._id ? (
              <div className="space-y-2">
                <Textarea
                  value={
                    editText
                  }
                  onChange={(
                    e
                  ) =>
                    setEditText(
                      e.target
                        .value
                    )
                  }
                />

                <div className="flex gap-2 justify-end">
                  <Button
                    onClick={
                      handleUpdateComment
                    }
                    disabled={
                      !editText.trim() ||
                      !withinTimeLimit
                    }
                  >
                    Save
                  </Button>

                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditingCommentId(
                        null
                      );

                      setEditText(
                        ""
                      );
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* ORIGINAL COMMENT */}
                <p className="text-sm">
                  {
                    comment.commentbody
                  }
                </p>

                {/* TRANSLATED COMMENT */}
                {translation &&
                  translationVisible && (
                    <div className="mt-2 rounded-md bg-muted/50 p-3">
                      <div className="text-xs text-muted-foreground mb-1">
                        Translated
                        {
                          translation.sourceLanguage
                            ? ` from ${translation.sourceLanguage}`
                            : ""
                        }{" "}
                        to{" "}
                        {
                          translation.targetLanguage
                        }
                      </div>

                      <p className="text-sm">
                        {
                          translation.translatedText
                        }
                      </p>
                    </div>
                  )}

                <div className="flex items-center gap-2 mt-2">
                  {/* LIKE */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 px-2"
                    onClick={() =>
                      handleReaction(
                        comment._id,
                        "like"
                      )
                    }
                    disabled={
                      reactionLoading[
                        comment._id
                      ]
                    }
                  >
                    <ThumbsUp
                      className={`w-4 h-4 ${
                        reaction?.reaction ===
                        "like"
                          ? "fill-current"
                          : ""
                      }`}
                    />

                    <span>
                      {
                        reaction?.likeCount ??
                        comment.likeCount ??
                        0
                      }
                    </span>
                  </Button>

                  {/* DISLIKE */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 px-2"
                    onClick={() =>
                      handleReaction(
                        comment._id,
                        "dislike"
                      )
                    }
                    disabled={
                      reactionLoading[
                        comment._id
                      ]
                    }
                  >
                    <ThumbsDown
                      className={`w-4 h-4 ${
                        reaction?.reaction ===
                        "dislike"
                          ? "fill-current"
                          : ""
                      }`}
                    />

                    <span>
                      {
                        reaction?.dislikeCount ??
                        comment.dislikeCount ??
                        0
                      }
                    </span>
                  </Button>

                  {/* REPLY */}
                  {user && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2"
                      onClick={() => {
                        setReplyingTo(
                          replyingTo ===
                            comment._id
                            ? null
                            : comment._id
                        );

                        setReplyText(
                          ""
                        );
                      }}
                    >
                      Reply
                    </Button>
                  )}

                  {/* TRANSLATE */}
                  {user && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2"
                      onClick={() =>
                        handleTranslate(
                          comment
                        )
                      }
                      disabled={
                        isTranslating
                      }
                    >
                      {isTranslating
                        ? "Translating..."
                        : translation
                        ? "Translate again"
                        : "Translate"}
                    </Button>
                  )}

                  {/* SHOW ORIGINAL */}
                  {translation &&
                    translationVisible && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2"
                        onClick={() =>
                          handleShowOriginal(
                            comment._id
                          )
                        }
                      >
                        Show original
                      </Button>
                    )}

                  {/* REPORT */}
                  {user && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2"
                      onClick={() => {
                        setReportCommentId(
                          comment._id
                        );

                        setReportReason(
                          "spam"
                        );

                        setReportDetails(
                          ""
                        );
                      }}
                    >
                      Report
                    </Button>
                  )}
                </div>

                {/* EDIT / DELETE */}
                {userOwnsComment &&
                  withinTimeLimit && (
                    <div className="flex gap-2 mt-2 text-sm text-gray-500">
                      <button
                        onClick={() =>
                          handleEdit(
                            comment
                          )
                        }
                      >
                        Edit
                      </button>

                      <button
                        onClick={() =>
                          handleDelete(
                            comment._id
                          )
                        }
                      >
                        Delete
                      </button>
                    </div>
                  )}

                {/* REPLY BOX */}
                {replyingTo ===
                  comment._id &&
                  user && (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        placeholder={`Reply to ${comment.usercommented}...`}
                        value={
                          replyText
                        }
                        onChange={(
                          e
                        ) =>
                          setReplyText(
                            e.target
                              .value
                          )
                        }
                        className="min-h-[60px] resize-none"
                      />

                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setReplyingTo(
                              null
                            );

                            setReplyText(
                              ""
                            );
                          }}
                        >
                          Cancel
                        </Button>

                        <Button
                          onClick={() =>
                            handleReply(
                              comment._id
                            )
                          }
                          disabled={
                            !replyText.trim() ||
                            isReplySubmitting ||
                            (captchaRequired &&
                              !captchaToken)
                          }
                        >
                          Reply
                        </Button>
                      </div>
                    </div>
                  )}
              </>
            )}
          </div>
        </div>

        {/* NESTED REPLIES */}
        {replies.length >
          0 && (
          <div className="mt-4 space-y-4">
            {replies.map(
              (
                reply
              ) =>
                renderComment(
                  reply,
                  true
                )
            )}
          </div>
        )}
      </div>
    );
  };

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <div>
        Loading history...
      </div>
    );
  }

  // =====================================================
  // SORTED COMMENTS
  // =====================================================

  const sortedTopLevelComments =
    getSortedTopLevelComments();

  // =====================================================
  // MAIN UI
  // =====================================================

  return (
    <div className="space-y-6">
      {/* COMMENTS HEADER + SORTING */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">
          {comments.length}{" "}
          Comments
        </h2>

        <select
          value={
            sortOption
          }
          onChange={(
            e
          ) =>
            setSortOption(
              e.target
                .value as SortOption
            )
          }
          className="border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="newest">
            Newest
          </option>

          <option value="oldest">
            Oldest
          </option>

          <option value="mostLiked">
            Most Liked
          </option>

          <option value="mostRelevant">
            Most Relevant
          </option>
        </select>
      </div>

      {/* NEW COMMENT */}
      {user && (
        <div className="flex gap-4">
          <Avatar className="w-10 h-10">
            <AvatarImage
              src={
                user.image || ""
              }
            />

            <AvatarFallback>
              {user.name?.[0] ||
                "U"}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-2">
            <Textarea
              placeholder="Add a comment..."
              value={
                newComment
              }
              onChange={(
                e: any
              ) =>
                setNewComment(
                  e.target
                    .value
                )
              }
              className="min-h-[80px] resize-none border-0 border-b-2 rounded-none focus-visible:ring-0"
            />

            {/* =================================================
                CAPTCHA
                Appears only after rate limit is reached.
                ================================================= */}
            {captchaRequired && (
              <div
                ref={
                  captchaContainerRef
                }
                className="mt-2"
              />
            )}

            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={() =>
                  setNewComment(
                    ""
                  )
                }
                disabled={
                  !newComment.trim()
                }
              >
                Cancel
              </Button>

              <Button
                onClick={
                  handleSubmitComment
                }
                disabled={
                  !newComment.trim() ||
                  isSubmitting ||
                  (captchaRequired &&
                    !captchaToken)
                }
              >
                Comment
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* COMMENTS LIST */}
      <div className="space-y-4">
        {comments.length ===
        0 ? (
          <p className="text-sm text-gray-500 italic">
            No comments yet. Be the
            first to comment!
          </p>
        ) : (
          sortedTopLevelComments.map(
            (
              comment
            ) =>
              renderComment(
                comment
              )
          )
        )}
      </div>

      {/* =====================================================
          REPORT COMMENT DIALOG
          ===================================================== */}

      {reportCommentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">
                Report Comment
              </h3>

              <p className="mt-1 text-sm text-muted-foreground">
                Select a reason for reporting this comment.
              </p>
            </div>

            {/* REPORT REASON */}
            <div className="space-y-2">
              <label
                htmlFor="report-reason"
                className="text-sm font-medium"
              >
                Reason
              </label>

              <select
                id="report-reason"
                value={
                  reportReason
                }
                onChange={(
                  e
                ) =>
                  setReportReason(
                    e.target
                      .value as
                      | "spam"
                      | "harassment"
                      | "offensive_content"
                      | "malicious_link"
                      | "other"
                  )
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                disabled={
                  reportSubmitting
                }
              >
                <option value="spam">
                  Spam
                </option>

                <option value="harassment">
                  Harassment
                </option>

                <option value="offensive_content">
                  Offensive content
                </option>

                <option value="malicious_link">
                  Malicious link
                </option>

                <option value="other">
                  Other
                </option>
              </select>
            </div>

            {/* REPORT DETAILS */}
            <div className="mt-4 space-y-2">
              <label
                htmlFor="report-details"
                className="text-sm font-medium"
              >
                Additional details
              </label>

              <Textarea
                id="report-details"
                placeholder="Optional details about the report..."
                value={
                  reportDetails
                }
                onChange={(
                  e
                ) =>
                  setReportDetails(
                    e.target.value
                  )
                }
                maxLength={
                  1000
                }
                disabled={
                  reportSubmitting
                }
                className="min-h-[100px] resize-none"
              />

              <div className="text-right text-xs text-muted-foreground">
                {
                  reportDetails.length
                }
                /1000
              </div>
            </div>

            {/* DIALOG BUTTONS */}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  if (
                    reportSubmitting
                  ) {
                    return;
                  }

                  setReportCommentId(
                    null
                  );

                  setReportReason(
                    "spam"
                  );

                  setReportDetails(
                    ""
                  );
                }}
                disabled={
                  reportSubmitting
                }
              >
                Cancel
              </Button>

              <Button
                onClick={
                  handleReportComment
                }
                disabled={
                  reportSubmitting ||
                  reportDetails.trim()
                    .length >
                    1000
                }
              >
                {reportSubmitting
                  ? "Reporting..."
                  : "Submit Report"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Comments;