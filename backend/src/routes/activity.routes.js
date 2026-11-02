import { Router } from "express";
import ActivityLog from "../models/ActivityLog.js";

import { protect } from "../middleware/auth.middleware.js";
import { attachTenant } from "../middleware/tenant.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(protect, attachTenant);

// Get tenant activity logs
router.get("/", asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);

  const limit = Math.min(
    100,
    Math.max(1, Number(req.query.limit) || 30)
  );

  const filter = {
    tenantId: req.tenant._id,
    organizationId: req.organizationId
  };

  if (req.query.boardId) {
    filter.boardId = req.query.boardId;
  }

  const [activities, total] = await Promise.all([
    ActivityLog.find(filter)
      .populate("actorId", "name email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),

    ActivityLog.countDocuments(filter)
  ]);

  res.json({
    success: true,
    activities,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}));

export default router;