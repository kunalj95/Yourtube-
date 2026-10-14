import React, { useState } from "react";
import { Button } from "./ui/button";

const tabs = [
  { id: "home", label: "Home" },
  { id: "videos", label: "Videos" },
  { id: "shorts", label: "Shorts" },
  { id: "playlists", label: "Playlists" },
  { id: "community", label: "Community" },
  { id: "about", label: "About" },
  { id: "downloads", label: "Downloads" },
];

interface ChanneltabsProps {
  onTabChange?: (tabId: string) => void;
}

const Channeltabs = ({ onTabChange }: ChanneltabsProps) => {
  const [activeTab, setActiveTab] = useState("videos");

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);

    if (onTabChange) {
      onTabChange(tabId);
    }
  };

  return (
    <div className="border-b px-4">
      <div className="flex gap-8 overflow-x-auto">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant="ghost"
            className={`px-0 py-4 border-b-2 rounded-none ${
              activeTab === tab.id
                ? "border-black text-black"
                : "border-transparent text-gray-600 hover:text-black"
            }`}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>
    </div>
  );
};

export default Channeltabs;