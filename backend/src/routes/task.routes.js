import { Router } from "express";

import Task from "../models/Task.js";
import Board from "../models/Board.js";
import Column from "../models/Column.js";
import Membership from "../models/Membership.js";

import { protect } from "../middleware/auth.middleware.js";
import { attachTenant } from "../middleware/tenant.middleware.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
import { requireFields } from "../utils/validate.js";

import { logActivity } from "../services/activity.service.js";
import { emitToTenant } from "../socket/index.js";

const router = Router();

router.use(protect, attachTenant);

const scope = (req) => ({
  tenantId: req.tenant._id,
  organizationId: req.organizationId
});


// GET TASKS
router.get("/", asyncHandler(async (req, res) => {
  const { boardId } = req.query;

  if (!boardId) {
    throw new HttpError(400, "boardId is required");
  }

  const board = await Board.findOne({
    _id: boardId,
    ...scope(req)
  });

  if (!board) {
    throw new HttpError(404, "Board not found");
  }

  const tasks = await Task.find({
    boardId: board._id,
    ...scope(req)
  })
    .populate("assigneeId", "name email")
    .sort({ position: 1, createdAt: 1 });

  res.json({
    success: true,
    count: tasks.length,
    tasks
  });
}));


// CREATE TASK
router.post("/", asyncHandler(async (req, res) => {
  requireFields(req.body, [
    "boardId",
    "columnId",
    "title"
  ]);

  const [board, column] = await Promise.all([
    Board.findOne({
      _id: req.body.boardId,
      ...scope(req)
    }),

    Column.findOne({
      _id: req.body.columnId,
      boardId: req.body.boardId,
      ...scope(req)
    })
  ]);

  if (!board || !column) {
    throw new HttpError(404, "Board or column not found");
  }

  if (req.body.assigneeId) {
    const member = await Membership.exists({
      userId: req.body.assigneeId,
      tenantId: req.tenant._id,
      isActive: true
    });

    if (!member) {
      throw new HttpError(400, "Assignee must belong to this tenant");
    }
  }

  const position = req.body.position ??
    await Task.countDocuments({
      columnId: column._id,
      ...scope(req)
    });

  const task = await Task.create({
    ...scope(req),
    boardId: board._id,
    columnId: column._id,
    title: req.body.title,
    description: req.body.description || "",
    priority: req.body.priority || "medium",
    assigneeId: req.body.assigneeId || null,
    dueDate: req.body.dueDate || null,
    position,
    createdBy: req.user._id
  });

  await task.populate("assigneeId", "name email");

  await logActivity({
    req,
    action: "task.created",
    message: `Created task "${task.title}"`,
    boardId: board._id,
    taskId: task._id
  });

  emitToTenant(
    req.tenant._id,
    "task:created",
    task
  );

  res.status(201).json({
    success: true,
    task
  });
}));

// UPDATE TASK
router.patch("/:taskId", asyncHandler(async (req, res) => {
  const allowedFields = [
    "title",
    "description",
    "priority",
    "assigneeId",
    "dueDate"
  ];

  const updates = {};

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  if (updates.assigneeId) {
    const member = await Membership.exists({
      userId: updates.assigneeId,
      tenantId: req.tenant._id,
      isActive: true
    });

    if (!member) {
      throw new HttpError(400, "Invalid tenant assignee");
    }
  }

  const expectedVersion = Number(req.body.version);

  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new HttpError(400, "Valid task version is required");
  }

  const task = await Task.findOneAndUpdate(
    {
      _id: req.params.taskId,
      ...scope(req),
      version: expectedVersion
    },
    {
      $set: updates,
      $inc: { version: 1 }
    },
    {
      new: true,
      runValidators: true
    }
  ).populate("assigneeId", "name email");

  if (!task) {
    const current = await Task.findOne({
      _id: req.params.taskId,
      ...scope(req)
    });

    if (!current) {
      throw new HttpError(404, "Task not found");
    }

    throw new HttpError(
      409,
      "Task was modified by another user. Refresh and retry.",
      { currentVersion: current.version }
    );
  }

  await logActivity({
    req,
    action: "task.updated",
    message: `Updated task "${task.title}"`,
    boardId: task.boardId,
    taskId: task._id,
    metadata: { version: task.version }
  });

  emitToTenant(
    req.tenant._id,
    "task:updated",
    task
  );

  res.json({ success: true, task });
}));

// MOVE TASK / DRAG AND DROP
router.patch("/:taskId/move", asyncHandler(async (req, res) => {
  requireFields(req.body, [
    "targetColumnId",
    "version"
  ]);

  const task = await Task.findOne({
    _id: req.params.taskId,
    ...scope(req)
  });

  if (!task) {
    throw new HttpError(404, "Task not found");
  }

  const targetColumn = await Column.findOne({
    _id: req.body.targetColumnId,
    boardId: task.boardId,
    ...scope(req)
  });

  if (!targetColumn) {
    throw new HttpError(404, "Target column not found");
  }

  const expectedVersion = Number(req.body.version);

  if (task.version !== expectedVersion) {
    throw new HttpError(
      409,
      "Task changed by another user",
      { currentVersion: task.version }
    );
  }

  const position = Number.isFinite(Number(req.body.position))
    ? Math.max(0, Number(req.body.position))
    : await Task.countDocuments({
        columnId: targetColumn._id,
        ...scope(req)
      });

  // Atomic version check
  const moved = await Task.findOneAndUpdate(
    {
      _id: task._id,
      ...scope(req),
      version: expectedVersion
    },
    {
      $set: {
        columnId: targetColumn._id,
        position
      },
      $inc: { version: 1 }
    },
    { new: true }
  );

  if (!moved) {
    throw new HttpError(
      409,
      "Concurrent move detected. Refresh the board."
    );
  }

  // Recalculate ordering in affected columns
//   const oldColumnId = task.columnId;

//   const affectedColumns = [
//     ...new Set([
//       String(oldColumnId),
//       String(targetColumn._id)
//     ])
//   ];

//   for (const columnId of affectedColumns) {
//     const tasks = await Task.find({
//       columnId,
//       ...scope(req)
//     }).sort({
//       position: 1,
//       updatedAt: 1
//     });

//     await Promise.all(
//       tasks.map((item, index) =>
//         Task.updateOne(
//           { _id: item._id, ...scope(req) },
//           { $set: { position: index } }
//         )
//       )
//     );
//   }

// Recalculate ordering in affected columns
const oldColumnId = task.columnId;

const affectedColumns = [
  ...new Set([
    String(oldColumnId),
    String(targetColumn._id)
  ])
];

for (const columnId of affectedColumns) {
  const tasks = await Task.find({
    columnId,
    ...scope(req)
  }).sort({
    position: 1,
    updatedAt: 1
  });

  for (let index = 0; index < tasks.length; index++) {
    if (tasks[index].position !== index) {
      await Task.updateOne(
        {
          _id: tasks[index]._id,
          ...scope(req)
        },
        {
          $set: { position: index },
          $inc: { version: 1 }
        }
      );
    }
  }
}

  const result = await Task.findById(moved._id)
    .populate("assigneeId", "name email");

  await logActivity({
    req,
    action: "task.moved",
    message: `Moved task "${task.title}"`,
    boardId: task.boardId,
    taskId: task._id,
    metadata: {
      fromColumnId: oldColumnId,
      toColumnId: targetColumn._id,
      position
    }
  });

  emitToTenant(
    req.tenant._id,
    "task:moved",
    result
  );

  res.json({
    success: true,
    task: result
  });
}));

// DELETE TASK
router.delete("/:taskId", asyncHandler(async (req, res) => {
  const task = await Task.findOneAndDelete({
    _id: req.params.taskId,
    ...scope(req)
  });

  if (!task) {
    throw new HttpError(404, "Task not found");
  }

  await logActivity({
    req,
    action: "task.deleted",
    message: `Deleted task "${task.title}"`,
    boardId: task.boardId,
    taskId: task._id
  });

  emitToTenant(
    req.tenant._id,
    "task:deleted",
    {
      taskId: task._id,
      boardId: task.boardId
    }
  );

  res.json({
    success: true,
    message: "Task deleted"
  });
}));

export default router;