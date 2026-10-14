
import {
  Bell,
  Menu,
  Mic,
  Search,
  User,
  VideoIcon,
  Sun,
  Moon,
  ShieldCheck,
  Languages,
} from "lucide-react";

import React, {
  useEffect,
  useState,
} from "react";

import {
  Button,
} from "./ui/button";

import Link from "next/link";

import {
  Input,
} from "./ui/input";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "./ui/avatar";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

import {
  Label,
} from "./ui/label";

import Channeldialogue from "./channeldialogue";

import {
  useRouter,
} from "next/router";

import {
  useUser,
} from "@/lib/AuthContext";

import axiosInstance from "@/lib/axiosinstance";

const Header = () => {
  const {
    user,
    logout,
    handlegooglesignin,
    updateTheme,
    login,
  } = useUser();

  const [
    searchQuery,
    setSearchQuery,
  ] = useState("");

  const [
    isdialogeopen,
    setisdialogeopen,
  ] = useState(false);

  // -----------------------------------------
  // Preferred language state
  // -----------------------------------------

  const [
    isLanguageDialogOpen,
    setIsLanguageDialogOpen,
  ] = useState(false);

  const [
    preferredLanguage,
    setPreferredLanguage,
  ] = useState("en");

  const [
    isLanguageLoading,
    setIsLanguageLoading,
  ] = useState(false);

  const router = useRouter();

  // -----------------------------------------
  // Open video call
  // -----------------------------------------

  const handleVideoCall = () => {
    router.push("/meeting/123");
  };

  // -----------------------------------------
  // Search
  // -----------------------------------------

  const handleSearch = (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (
      searchQuery.trim()
    ) {
      router.push(
        `/search?q=${encodeURIComponent(
          searchQuery.trim()
        )}`
      );
    }
  };

  const handleKeypress = (
    e: React.KeyboardEvent
  ) => {
    if (
      e.key === "Enter"
    ) {
      handleSearch(
        e as any
      );
    }
  };

  // -----------------------------------------
  // Handle theme change
  // -----------------------------------------

  const handleThemeChange =
    async (
      theme: "light" | "dark"
    ) => {
      await updateTheme(theme);
    };

  // -----------------------------------------
  // Load preferred language
  // -----------------------------------------

  useEffect(() => {
    if (
      !isLanguageDialogOpen ||
      !user
    ) {
      return;
    }

    const loadPreferredLanguage =
      async () => {
        try {
          const response =
            await axiosInstance.get(
              "/comment/preferred-language"
            );

          if (
            response?.data?.preferredLanguage
          ) {
            setPreferredLanguage(
              response.data.preferredLanguage
            );
          }
        } catch (error) {
          console.error(
            "Unable to load preferred language:",
            error
          );

          setPreferredLanguage(
            (user as any)?.preferredLanguage ||
              "en"
          );
        }
      };

    loadPreferredLanguage();
  }, [
    isLanguageDialogOpen,
    user,
  ]);

  // -----------------------------------------
  // Save preferred language
  // -----------------------------------------

  const handleLanguageSave =
    async () => {
      if (
        isLanguageLoading ||
        !user
      ) {
        return;
      }

      setIsLanguageLoading(true);

      try {
        await axiosInstance.patch(
          "/comment/preferred-language",
          {
            preferredLanguage,
          }
        );

        // Update frontend user immediately.

        login({
          ...user,
          preferredLanguage,
        });

        setIsLanguageDialogOpen(false);
      } catch (error) {
        console.error(
          "Unable to save preferred language:",
          error
        );
      } finally {
        setIsLanguageLoading(false);
      }
    };

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-white border-b">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
        >
          <Menu className="w-6 h-6" />
        </Button>

        <Link
          href="/"
          className="flex items-center gap-1"
        >
          <div className="bg-red-600 p-1 rounded">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="white"
            >
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </div>

          <span className="text-xl font-medium">
            YourTube
          </span>

          <span className="text-xs text-gray-400 ml-1">
            IN
          </span>
        </Link>
      </div>

      <form
        onSubmit={handleSearch}
        className="flex items-center gap-2 flex-1 max-w-2xl mx-4"
      >
        <div className="flex flex-1">
          <Input
            type="search"
            placeholder="Search"
            value={searchQuery}
            onKeyPress={handleKeypress}
            onChange={(e) =>
              setSearchQuery(e.target.value)
            }
            className="rounded-l-full border-r-0 focus-visible:ring-0"
          />

          <Button
            type="submit"
            className="rounded-r-full px-6 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-l-0"
          >
            <Search className="w-5 h-5" />
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
        >
          <Mic className="w-5 h-5" />
        </Button>
      </form>

      <div className="flex items-center gap-2">
        {user ? (
          <>
            {/* Video call button */}

            <Button
              variant="ghost"
              size="icon"
              onClick={handleVideoCall}
              title="Start video call"
              aria-label="Start video call"
            >
              <VideoIcon className="w-6 h-6" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
            >
              <Bell className="w-6 h-6" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-8 w-8 rounded-full"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={user.image}
                    />

                    <AvatarFallback>
                      {user.name?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                className="w-56"
                align="end"
                forceMount
              >
                {user?.channelname ? (
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/channel/${user?._id}`}
                    >
                      Your channel
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  <div className="px-2 py-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        setisdialogeopen(true)
                      }
                    >
                      Create Channel
                    </Button>
                  </div>
                )}

                <DropdownMenuItem asChild>
                  <Link href="/history">
                    History
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link href="/liked">
                    Liked videos
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link href="/watch-later">
                    Watch later
                  </Link>
                </DropdownMenuItem>

                {/* Preferred Language */}

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() =>
                    setIsLanguageDialogOpen(true)
                  }
                >
                  <Languages className="mr-2 h-4 w-4" />
                  Preferred language
                </DropdownMenuItem>

                {/* Account Security */}

                <DropdownMenuSeparator />

                <DropdownMenuItem asChild>
                  <Link
                    href="/security"
                    className="flex w-full items-center"
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Account security
                  </Link>
                </DropdownMenuItem>

                {/* Admin Panel */}

                {user?.role === "admin" && (
                  <>
                    <DropdownMenuSeparator />

                    <DropdownMenuItem asChild>
                      <Link
                        href="/admin/comment-reports"
                        className="flex w-full items-center"
                      >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Admin Panel
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}

                {/* Theme options */}

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() =>
                    handleThemeChange("light")
                  }
                >
                  <Sun className="mr-2 h-4 w-4" />
                  Light theme
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() =>
                    handleThemeChange("dark")
                  }
                >
                  <Moon className="mr-2 h-4 w-4" />
                  Dark theme
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={logout}>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <Button
            className="flex items-center gap-2"
            onClick={handlegooglesignin}
          >
            <User className="w-4 h-4" />
            Sign in
          </Button>
        )}
      </div>

      {/* Existing Channel Dialog */}

      <Channeldialogue
        isopen={isdialogeopen}
        onclose={() =>
          setisdialogeopen(false)
        }
        mode="create"
      />

      {/* Preferred Language Dialog */}

      <Dialog
        open={isLanguageDialogOpen}
        onOpenChange={setIsLanguageDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Preferred Language
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="preferredLanguage">
              Choose your preferred language
            </Label>

            <select
              id="preferredLanguage"
              value={preferredLanguage}
              onChange={(e) =>
                setPreferredLanguage(e.target.value)
              }
              disabled={isLanguageLoading}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="it">Italian</option>
              <option value="pt">Portuguese</option>
              <option value="ru">Russian</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="zh">Chinese</option>
              <option value="ar">Arabic</option>
              <option value="bn">Bengali</option>
              <option value="ta">Tamil</option>
              <option value="te">Telugu</option>
              <option value="mr">Marathi</option>
              <option value="gu">Gujarati</option>
              <option value="pa">Punjabi</option>
              <option value="pl">Polish</option>
              <option value="ro">Romanian</option>
              <option value="nl">Dutch</option>
              <option value="sv">Swedish</option>
              <option value="da">Danish</option>
              <option value="fi">Finnish</option>
              <option value="no">Norwegian</option>
              <option value="cs">Czech</option>
              <option value="sk">Slovak</option>
              <option value="sl">Slovenian</option>
              <option value="uk">Ukrainian</option>
              <option value="tr">Turkish</option>
              <option value="vi">Vietnamese</option>
              <option value="th">Thai</option>
              <option value="he">Hebrew</option>
              <option value="id">Indonesian</option>
            </select>
          </div>

          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setIsLanguageDialogOpen(false)
              }
              disabled={isLanguageLoading}
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={handleLanguageSave}
              disabled={isLanguageLoading}
            >
              {isLanguageLoading
                ? "Saving..."
                : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
};

export default Header;
