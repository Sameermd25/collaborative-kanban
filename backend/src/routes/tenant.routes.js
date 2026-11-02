import { Router } from "express";
import Tenant from "../models/Tenant.js";
import Membership from "../models/Membership.js";
import User from "../models/User.js";

import { protect } from "../middleware/auth.middleware.js";
import {
  attachTenant,
  requireRole
} from "../middleware/tenant.middleware.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
import { requireFields } from "../utils/validate.js";

const router = Router();

router.use(protect);

// Get user's tenants
router.get("/", asyncHandler(async (req, res) => {
  const memberships = await Membership.find({
    userId: req.user._id,
    isActive: true
  }).populate("tenantId");

  res.json({
    success: true,
    tenants: memberships.map((membership) => ({
      tenant: membership.tenantId,
      role: membership.role,
      organizationId: membership.organizationId
    }))
  });
}));

// Create tenant
router.post("/", asyncHandler(async (req, res) => {
  requireFields(req.body, ["organizationId", "name"]);

  const membership = await Membership.findOne({
    userId: req.user._id,
    organizationId: req.body.organizationId,
    role: "org_admin",
    isActive: true
  });

  if (!membership) {
    throw new HttpError(403, "Only organization admins can create tenants");
  }

  const slug = req.body.name.toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-");

  const tenant = await Tenant.create({
    organizationId: membership.organizationId,
    name: req.body.name,
    slug
  });

  await Membership.create({
    userId: req.user._id,
    organizationId: membership.organizationId,
    tenantId: tenant._id,
    role: "org_admin"
  });

  res.status(201).json({
    success: true,
    tenant
  });
}));

// Get tenant members
router.get(
  "/:tenantId/members",
  attachTenant,
  asyncHandler(async (req, res) => {
    const members = await Membership.find({
      tenantId: req.tenant._id,
      organizationId: req.organizationId,
      isActive: true
    }).populate("userId", "name email");

    res.json({
      success: true,
      members
    });
  })
);

// Add existing registered user to tenant
router.post(
  "/:tenantId/members",
  attachTenant,
  requireRole("org_admin", "tenant_admin"),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ["email", "role"]);

    if (!["tenant_admin", "member"].includes(req.body.role)) {
      throw new HttpError(400, "Invalid role");
    }

    const user = await User.findOne({
      email: req.body.email.toLowerCase()
    });

    if (!user) {
      throw new HttpError(404, "User must register first");
    }

    const membership = await Membership.findOneAndUpdate(
      {
        userId: user._id,
        tenantId: req.tenant._id
      },
      {
        $set: {
          organizationId: req.organizationId,
          role: req.body.role,
          isActive: true
        }
      },
      {
        upsert: true,
        new: true,
        runValidators: true
      }
    );

    res.status(201).json({
      success: true,
      membership
    });
  })
);

// Update member role or deactivate membership
router.patch(
  "/:tenantId/members/:membershipId",
  attachTenant,
  requireRole("org_admin"),
  asyncHandler(async (req, res) => {
    const { role, isActive } = req.body;

    if (role && !["org_admin", "tenant_admin", "member"].includes(role)) {
      throw new HttpError(400, "Invalid role");
    }

    const membership = await Membership.findOneAndUpdate(
      {
        _id: req.params.membershipId,
        tenantId: req.tenant._id,
        organizationId: req.organizationId
      },
      {
        $set: {
          ...(role ? { role } : {}),
          ...(isActive !== undefined ? { isActive } : {})
        }
      },
      { new: true, runValidators: true }
    );

    if (!membership) {
      throw new HttpError(404, "Membership not found");
    }

    res.json({ success: true, membership });
  })
);

export default router;