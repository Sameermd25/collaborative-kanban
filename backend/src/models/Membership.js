import mongoose from "mongoose";

const membershipSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true
    },
    role: {
      type: String,
      enum: ["org_admin", "tenant_admin", "member"],
      default: "member"
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

membershipSchema.index(
  { userId: 1, tenantId: 1 },
  { unique: true }
);

export default mongoose.model(
  "Membership",
  membershipSchema
);