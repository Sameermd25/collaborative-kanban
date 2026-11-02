import mongoose from "mongoose";

const tenantSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true
    },
    slug: {
      type: String,
      required: true,
      lowercase: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

tenantSchema.index(
  { organizationId: 1, slug: 1 },
  { unique: true }
);

export default mongoose.model("Tenant", tenantSchema);