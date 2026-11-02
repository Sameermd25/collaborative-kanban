import { Router } from "express";
import Board from "../models/Board.js";
import Column from "../models/Column.js";
import Task from "../models/Task.js";

import { protect } from "../middleware/auth.middleware.js";
import {
  attachTenant,
  requireRole
} from "../middleware/tenant.middleware.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
import { requireFields } from "../utils/validate.js";
import { logActivity } from "../services/activity.service.js";
import { emitToTenant } from "../socket/index.js";

const router = Router();

router.use(protect, attachTenant);

// Get all boards
router.get("/", asyncHandler(async (req, res) => {
  const boards = await Board.find({
    tenantId: req.tenant._id,
    organizationId: req.organizationId,
    isArchived: false
  }).sort({ createdAt: -1 });

  res.json({ success: true, boards });
}));

// Create board
router.post(
  "/",
  requireRole("org_admin", "tenant_admin"),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ["name"]);

    const board = await Board.create({
      organizationId: req.organizationId,
      tenantId: req.tenant._id,
      name: req.body.name,
      description: req.body.description || "",
      createdBy: req.user._id
    });

    const defaultColumns = ["To Do", "In Progress", "Done"];

    await Column.insertMany(
      defaultColumns.map((title, position) => ({
        organizationId: req.organizationId,
        tenantId: req.tenant._id,
        boardId: board._id,
        title,
        position
      }))
    );

    await logActivity({
      req,
      action: "board.created",
      message: `Created board "${board.name}"`,
      boardId: board._id
    });

    emitToTenant(req.tenant._id, "board:created", board);

    res.status(201).json({
      success: true,
      board
    });
  })
);

// Get single board with columns and tasks
router.get("/:boardId", asyncHandler(async (req, res) => {
  const board = await Board.findOne({
    _id: req.params.boardId,
    tenantId: req.tenant._id,
    organizationId: req.organizationId
  });

  if (!board) {
    throw new HttpError(404, "Board not found");
  }

  const [columns, tasks] = await Promise.all([
    Column.find({
      boardId: board._id,
      tenantId: req.tenant._id,
      organizationId: req.organizationId
    }).sort({ position: 1 }),

    Task.find({
      boardId: board._id,
      tenantId: req.tenant._id,
      organizationId: req.organizationId
    })
      .populate("assigneeId", "name email")
      .sort({ position: 1 })
  ]);

  res.json({
    success: true,
    board,
    columns,
    tasks
  });
}));

// Update board
router.patch(
  "/:boardId",
  requireRole("org_admin", "tenant_admin"),
  asyncHandler(async (req, res) => {
    const board = await Board.findOneAndUpdate(
      {
        _id: req.params.boardId,
        tenantId: req.tenant._id,
        organizationId: req.organizationId
      },
      {
        $set: {
          ...(req.body.name ? { name: req.body.name } : {}),
          ...(req.body.description !== undefined
            ? { description: req.body.description }
            : {}),
          ...(req.body.isArchived !== undefined
            ? { isArchived: req.body.isArchived }
            : {})
        }
      },
      { new: true, runValidators: true }
    );

    if (!board) {
      throw new HttpError(404, "Board not found");
    }

    emitToTenant(req.tenant._id, "board:updated", board);

    res.json({ success: true, board });
  })
);

// Delete board and its contents
router.delete(
  "/:boardId",
  requireRole("org_admin", "tenant_admin"),
  asyncHandler(async (req, res) => {
    const filter = {
      boardId: req.params.boardId,
      tenantId: req.tenant._id,
      organizationId: req.organizationId
    };

    const board = await Board.findOneAndDelete({
      _id: req.params.boardId,
      tenantId: req.tenant._id,
      organizationId: req.organizationId
    });

    if (!board) {
      throw new HttpError(404, "Board not found");
    }

    await Promise.all([
      Column.deleteMany(filter),
      Task.deleteMany(filter)
    ]);

    await logActivity({
      req,
      action: "board.deleted",
      message: `Deleted board "${board.name}"`,
      boardId: board._id
    });

    emitToTenant(req.tenant._id, "board:deleted", {
      boardId: board._id
    });

    res.json({
      success: true,
      message: "Board deleted"
    });
  })
);

export default router;