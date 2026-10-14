const SUBSCRIPTION_PLANS = {
  Free: {
    name: "Free",
    price: {
      monthly: 0,
      quarterly: 0,
      yearly: 0,
    },

    validity: {
      monthly: 30,
      quarterly: 90,
      yearly: 365,
    },

    features: {
      premiumVideos: "Limited",
      streamingQuality: "480p",
      watchTime: "60 minutes/day",
      downloadsPerDay: 1,
      offlineDownloads: true,
      priorityContent: false,
      fasterStreaming: false,
      exclusiveCourses: false,
      adFree: false,
    },
  },

  Bronze: {
    name: "Bronze",

    price: {
      monthly: 99,
      quarterly: 249,
      yearly: 899,
    },

    validity: {
      monthly: 30,
      quarterly: 90,
      yearly: 365,
    },

    features: {
      premiumVideos: "More access",
      streamingQuality: "720p",
      watchTime: "180 minutes/day",
      downloadsPerDay: 3,
      offlineDownloads: true,
      priorityContent: true,
      fasterStreaming: true,
      exclusiveCourses: false,
      adFree: false,
    },
  },

  Silver: {
    name: "Silver",

    price: {
      monthly: 199,
      quarterly: 499,
      yearly: 1799,
    },

    validity: {
      monthly: 30,
      quarterly: 90,
      yearly: 365,
    },

    features: {
      premiumVideos: "Unlimited",
      streamingQuality: "1080p",
      watchTime: "300 minutes/day",
      downloadsPerDay: 5,
      offlineDownloads: true,
      priorityContent: true,
      fasterStreaming: true,
      exclusiveCourses: true,
      adFree: true,
    },
  },

  Gold: {
    name: "Gold",

    price: {
      monthly: 299,
      quarterly: 799,
      yearly: 2799,
    },

    validity: {
      monthly: 30,
      quarterly: 90,
      yearly: 365,
    },

    features: {
      premiumVideos: "Unlimited",
      streamingQuality: "Highest available",
      watchTime: "Unlimited",
      downloadsPerDay: 10,
      offlineDownloads: true,
      priorityContent: true,
      fasterStreaming: true,
      exclusiveCourses: true,
      adFree: true,
    },
  },
};

export default SUBSCRIPTION_PLANS;