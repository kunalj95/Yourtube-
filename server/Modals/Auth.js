import mongoose from "mongoose";

const userschema = mongoose.Schema({

  email: {

    type: String,

    required: true,

  },

  name: {

    type: String,

  },

  channelname: {

    type: String,

  },

  description: {

    type: String,

  },

  image: {

    type: String,

  },

  joinedon: {

    type: Date,

    default: Date.now,

  },

  // =====================================================

  // COMMENT TRANSLATION PREFERENCE

  // =====================================================

  preferredLanguage: {

    type: String,

    default: "en",

    trim: true,

    lowercase: true,

  },

  // =====================================================

  // THEME PREFERENCE

  // =====================================================

  themePreference: {

    type: String,

    enum: ["light", "dark"],

    default: null,

  },

  // =====================================================

  // SUBSCRIPTION

  // =====================================================

  subscriptionPlan: {

    type: String,

    enum: ["Free", "Bronze", "Silver", "Gold"],

    default: "Free",

  },

  subscriptionExpiresAt: {

    type: Date,

    default: null,

  },

  // =====================================================

  // USER ROLE

  // =====================================================

  role: {

    type: String,

    enum: ["user", "admin"],

    default: "user",

  },

});

export default mongoose.model("user", userschema);