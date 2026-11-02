import { Router } from "express";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import Tenant from "../models/Tenant.js";
import Membership from "../models/Membership.js";
import { protect } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
import { requireFields } from "../utils/validate.js";
import { signToken } from "../utils/token.js";

const router = Router();

const slugify = (value) =>
  value.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

router.post("/register", asyncHandler(async (req, res) => {
  requireFields(req.body, [
    "name",
    "email",
    "password",
    "organizationName",
    "tenantName"
  ]);

  const {
    name,
    email,
    password,
    organizationName,
    tenantName
  } = req.body;

  if (password.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters");
  }

  if (await User.findOne({ email: email.toLowerCase() })) {
    throw new HttpError(409, "Email already registered");
  }

  const organization = await Organization.create({
    name: organizationName,
    slug: `${slugify(organizationName)}-${Date.now().toString(36)}`
  });

  const tenant = await Tenant.create({
    organizationId: organization._id,
    name: tenantName,
    slug: slugify(tenantName) || "main"
  });

  const user = await User.create({
    name,
    email,
    password
  });

  await Membership.create({
    userId: user._id,
    organizationId: organization._id,
    tenantId: tenant._id,
    role: "org_admin"
  });

  const memberships = await Membership.find({
    userId: user._id,
    isActive: true,
  })
    .populate("organizationId", "name slug")
    .populate("tenantId", "name slug");

  res.status(201).json({
    success: true,
    token: signToken(user._id),
    user: {
      id: user._id,
      name: user.name,
      email: user.email
    },
    organization,
    tenant,
    memberships,
    role: "org_admin"
  });
}));

router.post("/login", asyncHandler(async (req, res) => {
  requireFields(req.body, ["email", "password"]);

  const user = await User.findOne({
    email: req.body.email.toLowerCase()
  }).select("+password");

  if (
    !user ||
    !user.isActive ||
    !(await user.comparePassword(req.body.password))
  ) {
    throw new HttpError(401, "Invalid email or password");
  }

  const memberships = await Membership.find({
    userId: user._id,
    isActive: true
  })
    .populate("organizationId", "name slug")
    .populate("tenantId", "name slug");

  res.json({
    success: true,
    token: signToken(user._id),
    user: {
      id: user._id,
      name: user.name,
      email: user.email
    },
    memberships
  });
}));

router.get("/me", protect, asyncHandler(async (req, res) => {
  const memberships = await Membership.find({
    userId: req.user._id,
    isActive: true
  })
    .populate("organizationId", "name slug")
    .populate("tenantId", "name slug");

  res.json({
    success: true,
    user: req.user,
    memberships
  });
}));

export default router;