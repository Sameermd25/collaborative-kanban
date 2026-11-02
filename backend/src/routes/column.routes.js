import { Router } from "express";

import Column from "../models/Column.js";
import Board from "../models/Board.js";
import Task from "../models/Task.js";

import { protect } from "../middleware/auth.middleware.js";
import {
  attachTenant,
  requireRole
} from "../middleware/tenant.middleware.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
import { requireFields } from "../utils/validate.js";
import { emitToTenant } from "../socket/index.js";

const router = Router();

router.use(protect, attachTenant);

// Create column
router.post(
  "/",
  requireRole("org_admin", "tenant_admin"),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ["boardId", "title"]);

    const board = await Board.findOne({
      _id: req.body.boardId,
      tenantId: req.tenant._id,
      organizationId: req.organizationId
    });

    if (!board) {
      throw new HttpError(404, "Board not found");
    }

    const count = await Column.countDocuments({
      boardId: board._id,
      tenantId: req.tenant._id
    });

    const column = await Column.create({
      organizationId: req.organizationId,
      tenantId: req.tenant._id,
      boardId: board._id,
      title: req.body.title,
      position: req.body.position ?? count
    });

    emitToTenant(req.tenant._id, "column:created", column);

    res.status(201).json({
      success: true,
      column
    });
  })
);

// Update column
router.patch(
  "/:columnId",
  requireRole("org_admin", "tenant_admin"),
  asyncHandler(async (req, res) => {
    const column = await Column.findOneAndUpdate(
      {
        _id: req.params.columnId,
        tenantId: req.tenant._id,
        organizationId: req.organizationId
      },
      {
        $set: {
          ...(req.body.title ? { title: req.body.title } : {}),
          ...(req.body.position !== undefined
            ? { position: req.body.position }
            : {})
        }
      },
      { new: true, runValidators: true }
    );

    if (!column) {
      throw new HttpError(404, "Column not found");
    }

    emitToTenant(req.tenant._id, "column:updated", column);

    res.json({ success: true, column });
  })
);

// Delete empty column
router.delete(
  "/:columnId",
  requireRole("org_admin", "tenant_admin"),
  asyncHandler(async (req, res) => {
    const column = await Column.findOne({
      _id: req.params.columnId,
      tenantId: req.tenant._id,
      organizationId: req.organizationId
    });

    if (!column) {
      throw new HttpError(404, "Column not found");
    }

    const taskCount = await Task.countDocuments({
      columnId: column._id,
      tenantId: req.tenant._id
    });

    if (taskCount > 0) {
      throw new HttpError(
        409,
        "Move or delete tasks before deleting this column"
      );
    }

    await column.deleteOne();

    emitToTenant(req.tenant._id, "column:deleted", {
      columnId: column._id,
      boardId: column.boardId
    });

    res.json({
      success: true,
      message: "Column deleted"
    });
  })
);

export default router;