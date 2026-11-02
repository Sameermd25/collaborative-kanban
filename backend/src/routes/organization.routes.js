import { Router } from "express";
import Organization from "../models/Organization.js";
import Tenant from "../models/Tenant.js";
import Membership from "../models/Membership.js";
import { protect } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

const router = Router();

router.use(protect);

// Get organizations accessible to logged-in user
router.get("/", asyncHandler(async (req, res) => {
  const organizationIds = await Membership.find({
    userId: req.user._id,
    isActive: true
  }).distinct("organizationId");

  const organizations = await Organization.find({
    _id: { $in: organizationIds },
    isActive: true
  });

  res.json({ success: true, organizations });
}));

// Get accessible tenants of an organization
router.get("/:organizationId/tenants", asyncHandler(async (req, res) => {
  const membership = await Membership.findOne({
    userId: req.user._id,
    organizationId: req.params.organizationId,
    isActive: true
  });

  if (!membership) {
    throw new HttpError(403, "Organization access denied");
  }

  const tenantIds = await Membership.find({
    userId: req.user._id,
    organizationId: membership.organizationId,
    isActive: true
  }).distinct("tenantId");

  const tenants = await Tenant.find({
    _id: { $in: tenantIds },
    organizationId: membership.organizationId,
    isActive: true
  });

  res.json({ success: true, tenants });
}));

export default router;