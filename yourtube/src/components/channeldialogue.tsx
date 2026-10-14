import { useRouter } from "next/router";
import React, {
  ChangeEvent,
  FormEvent,
  useEffect,
  useState,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";

const Channeldialogue = ({
  isopen,
  onclose,
  channeldata,
  mode,
}: any) => {
  const { user, login } = useUser();

  const router = useRouter();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    preferredLanguage: "en",
  });

  const [isSubmitting, setisSubmitting] = useState(false);

  // =====================================================
  // LOAD CHANNEL DATA + PREFERRED LANGUAGE
  // =====================================================

  useEffect(() => {
    if (!isopen) {
      return;
    }

    const loadData = async () => {
      // -----------------------------------------
      // Existing channel information
      // -----------------------------------------

      if (channeldata && mode === "edit") {
        setFormData({
          name: channeldata.name || "",
          description: channeldata.description || "",
          preferredLanguage:
            user?.preferredLanguage || "en",
        });
      } else {
        setFormData({
          name: user?.name || "",
          description: "",
          preferredLanguage:
            user?.preferredLanguage || "en",
        });
      }

      // -----------------------------------------
      // Get saved preferred language from backend
      // -----------------------------------------

      try {
        const response = await axiosInstance.get(
          "/comment/preferred-language"
        );

        if (
          response?.data?.success &&
          response?.data?.preferredLanguage
        ) {
          setFormData((prev) => ({
            ...prev,
            preferredLanguage:
              response.data.preferredLanguage,
          }));
        }
      } catch (error) {
        console.error(
          "Unable to load preferred language:",
          error
        );
      }
    };

    loadData();
  }, [isopen, channeldata, mode, user]);

  // =====================================================
  // HANDLE INPUT CHANGES
  // =====================================================

  const handleChange = (
    e: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // =====================================================
  // SUBMIT
  // =====================================================

  const handlesubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isSubmitting) {
      return;
    }

    setisSubmitting(true);

    try {
      // -----------------------------------------
      // Existing channel update
      // -----------------------------------------

      const payload = {
        channelname: formData.name,
        description: formData.description,
      };

      const response = await axiosInstance.patch(
        `/user/update/${user._id}`,
        payload
      );

      // Keep existing user update behavior
      login(response?.data);

      // -----------------------------------------
      // Update preferred language
      // -----------------------------------------

      await axiosInstance.patch(
        "/comment/preferred-language",
        {
          preferredLanguage:
            formData.preferredLanguage,
        }
      );

      // -----------------------------------------
      // Existing navigation
      // -----------------------------------------

      router.push(`/channel/${user?._id}`);

      setFormData({
        name: "",
        description: "",
        preferredLanguage: "en",
      });

      onclose();
    } catch (error) {
      console.error(
        "Unable to save channel settings:",
        error
      );
    } finally {
      setisSubmitting(false);
    }
  };

  return (
    <Dialog open={isopen} onOpenChange={onclose}>
      <DialogContent className="sm:max-w-md md:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create"
              ? "Create your channel"
              : "Edit your channel"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handlesubmit}
          className="space-y-6"
        >
          {/* Channel Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Channel Name
            </Label>

            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
            />
          </div>

          {/* Channel Description */}
          <div className="space-y-2">
            <Label htmlFor="description">
              Channel Description
            </Label>

            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              placeholder="Tell viewers about your channel..."
            />
          </div>

          {/* Preferred Language */}
          <div className="space-y-2">
            <Label htmlFor="preferredLanguage">
              Preferred Language
            </Label>

            <select
              id="preferredLanguage"
              name="preferredLanguage"
              value={formData.preferredLanguage}
              onChange={handleChange}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSubmitting}
            >
              <option value="en">
                English
              </option>

              <option value="hi">
                Hindi
              </option>

              <option value="es">
                Spanish
              </option>

              <option value="fr">
                French
              </option>

              <option value="de">
                German
              </option>

              <option value="it">
                Italian
              </option>

              <option value="pt">
                Portuguese
              </option>

              <option value="ru">
                Russian
              </option>

              <option value="ja">
                Japanese
              </option>

              <option value="ko">
                Korean
              </option>

              <option value="zh">
                Chinese
              </option>

              <option value="ar">
                Arabic
              </option>

              <option value="bn">
                Bengali
              </option>

              <option value="ta">
                Tamil
              </option>

              <option value="te">
                Telugu
              </option>

              <option value="mr">
                Marathi
              </option>

              <option value="gu">
                Gujarati
              </option>

              <option value="pa">
                Punjabi
              </option>

              <option value="pl">
                Polish
              </option>

              <option value="ro">
                Romanian
              </option>

              <option value="nl">
                Dutch
              </option>

              <option value="sv">
                Swedish
              </option>

              <option value="da">
                Danish
              </option>

              <option value="fi">
                Finnish
              </option>

              <option value="no">
                Norwegian
              </option>

              <option value="cs">
                Czech
              </option>

              <option value="sk">
                Slovak
              </option>

              <option value="sl">
                Slovenian
              </option>

              <option value="uk">
                Ukrainian
              </option>

              <option value="tr">
                Turkish
              </option>

              <option value="vi">
                Vietnamese
              </option>

              <option value="th">
                Thai
              </option>

              <option value="he">
                Hebrew
              </option>

              <option value="id">
                Indonesian
              </option>
            </select>
          </div>

          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={onclose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Saving..."
                : mode === "create"
                ? "Create Channel"
                : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default Channeldialogue;