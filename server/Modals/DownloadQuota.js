import mongoose from "mongoose";

const downloadQuotaSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },

    quotaDate: {
      type: Date,
      required: true,
    },

    used: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// One quota document per user per day
downloadQuotaSchema.index(
  {
    userId: 1,
    quotaDate: 1,
  },
  {
    unique: true,
  }
);

export default mongoose.model(
  "downloadquotas",
  downloadQuotaSchema
);