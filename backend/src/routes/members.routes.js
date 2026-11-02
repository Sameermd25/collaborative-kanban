import { Router } from "express";

import Membership from "../models/Membership.js";
import { protect } from "../middleware/auth.middleware.js";
import { attachTenant } from "../middleware/tenant.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get(
  "/",
  protect,
  attachTenant,
  asyncHandler(async (req, res) => {
    const memberships = await Membership.find({
      tenantId: req.tenant._id,
      isActive: true,
    })
      .populate("userId", "name email")
      .lean();

    const members = memberships
      .filter((membership) => membership.userId)
      .map((membership) => ({
        _id: membership.userId._id,
        name: membership.userId.name,
        email: membership.userId.email,
        role: membership.role,
      }));

    res.json({
      success: true,
      members,
    });
  })
);

export default router;