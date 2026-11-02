
const mongoose = require("mongoose");

const Task = require("../models/Task");
const Board = require("../models/Board");
const Column = require("../models/Column");
const Membership = require("../models/Membership");
const recordActivity = require("../services/activity.service");

const isValidId = (id) => mongoose.isValidObjectId(id);

const validateAssignee = async (assigneeId, tenant) => {
    if (!assigneeId) return true;

    if (!isValidId(assigneeId)) return false;

    const membership = await Membership.findOne({
        userId: assigneeId,
        organizationId: tenant.organizationId,
        tenantId: tenant._id,
        role: { $in: ["TENANT_ADMIN", "MEMBER"] },
    });

    return Boolean(membership);
};

// CREATE TASK
const createTask = async (req, res, next) => {
    try {
        const boardId = req.params.boardId || req.body.boardId;
        const columnId = req.params.columnId || req.body.columnId;

        const {
            title,
            description = "",
            priority = "medium",
            assigneeId = null,
        } = req.body;

        if (!title?.trim()) {
            return res.status(400).json({
                success: false,
                message: "Task title is required",
            });
        }

        if (!boardId || !columnId) {
            return res.status(400).json({
                success: false,
                message: "Board ID and column ID are required",
            });
        }

        if (!isValidId(boardId) || !isValidId(columnId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid board or column ID",
            });
        }

        if (!["low", "medium", "high"].includes(priority)) {
            return res.status(400).json({
                success: false,
                message: "Invalid priority",
            });
        }

        const board = await Board.findOne({
            _id: boardId,
            tenantId: req.tenant._id,
        });

        if (!board) {
            return res.status(404).json({
                success: false,
                message: "Board not found",
            });
        }

        const column = await Column.findOne({
            _id: columnId,
            boardId,
            tenantId: req.tenant._id,
        });

        if (!column) {
            return res.status(404).json({
                success: false,
                message: "Column not found",
            });
        }

        const validAssignee = await validateAssignee(
            assigneeId,
            req.tenant
        );

        if (!validAssignee) {
            return res.status(400).json({
                success: false,
                message: "Assignee does not belong to this tenant",
            });
        }

        const lastTask = await Task.findOne({
            boardId,
            columnId,
            tenantId: req.tenant._id,
        }).sort({ position: -1 });

        const task = await Task.create({
            organizationId: req.tenant.organizationId,
            tenantId: req.tenant._id,
            boardId,
            columnId,
            title: title.trim(),
            description,
            priority,
            assigneeId: assigneeId || null,
            position: lastTask ? lastTask.position + 1 : 0,
            createdBy: req.user._id,
        });

        await recordActivity({
            req,
            action: "TASK_CREATED",
            entityType: "TASK",
            entityId: task._id,
            metadata: {
                title: task.title,
            },
        });

        const populatedTask = await Task.findById(task._id)
            .populate("assigneeId", "name email");

        req.app.get("io")
            .to(`tenant:${req.tenant._id}`)
            .emit("task:created", populatedTask);

        return res.status(201).json({
            success: true,
            task: populatedTask,
        });
    } catch (error) {
        next(error);
    }
};

// GET TASKS
const getTasks = async (req, res, next) => {
    try {
        const boardId = req.params.boardId || req.query.boardId;

        if (!boardId || !isValidId(boardId)) {
            return res.status(400).json({
                success: false,
                message: "A valid board ID is required",
            });
        }

        const board = await Board.findOne({
            _id: boardId,
            tenantId: req.tenant._id,
        });

        if (!board) {
            return res.status(404).json({
                success: false,
                message: "Board not found",
            });
        }

        const tasks = await Task.find({
            boardId,
            tenantId: req.tenant._id,
        })
            .populate("assigneeId", "name email")
            .sort({ position: 1 });

        return res.status(200).json({
            success: true,
            tasks,
        });
    } catch (error) {
        next(error);
    }
};

// UPDATE TASK
const updateTask = async (req, res, next) => {
    try {
        const { taskId } = req.params;
        const {
            version,
            assigneeId,
            ...updates
        } = req.body;

        if (!isValidId(taskId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid task ID",
            });
        }

        if (!Number.isInteger(version) || version < 1) {
            return res.status(400).json({
                success: false,
                message: "A valid task version is required",
            });
        }

        const existingTask = await Task.findOne({
            _id: taskId,
            tenantId: req.tenant._id,
            ...(req.params.boardId
                ? { boardId: req.params.boardId }
                : {}),
        });

        if (!existingTask) {
            return res.status(404).json({
                success: false,
                message: "Task not found",
            });
        }

        const allowedFields = [
            "title",
            "description",
            "priority",
            "columnId",
            "position",
        ];

        const safeUpdates = {};

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                safeUpdates[field] = updates[field];
            }
        }

        if (safeUpdates.title !== undefined) {
            if (!safeUpdates.title.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Task title cannot be empty",
                });
            }

            safeUpdates.title = safeUpdates.title.trim();
        }

        if (
            safeUpdates.priority !== undefined &&
            !["low", "medium", "high"].includes(safeUpdates.priority)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid priority",
            });
        }

        if (assigneeId !== undefined) {
            const validAssignee = await validateAssignee(
                assigneeId,
                req.tenant
            );

            if (!validAssignee) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid tenant assignee",
                });
            }

            safeUpdates.assigneeId = assigneeId || null;
        }

        if (safeUpdates.columnId !== undefined) {
            if (!isValidId(safeUpdates.columnId)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid column ID",
                });
            }

            const column = await Column.findOne({
                _id: safeUpdates.columnId,
                boardId: existingTask.boardId,
                tenantId: req.tenant._id,
            });

            if (!column) {
                return res.status(400).json({
                    success: false,
                    message: "Target column is invalid",
                });
            }
        }

        const task = await Task.findOneAndUpdate(
            {
                _id: taskId,
                tenantId: req.tenant._id,
                boardId: existingTask.boardId,
                version,
            },
            {
                $set: safeUpdates,
                $inc: { version: 1 },
            },
            {
                new: true,
                runValidators: true,
            }
        ).populate("assigneeId", "name email");

        if (!task) {
            return res.status(409).json({
                success: false,
                message: "Task was changed by another user. Refresh and retry.",
            });
        }

        await recordActivity({
            req,
            action: "TASK_UPDATED",
            entityType: "TASK",
            entityId: task._id,
            metadata: {
                title: task.title,
            },
        });

        req.app.get("io")
            .to(`tenant:${req.tenant._id}`)
            .emit("task:updated", task);

        return res.status(200).json({
            success: true,
            task,
        });
    } catch (error) {
        next(error);
    }
};

// DELETE TASK
const deleteTask = async (req, res, next) => {
    try {
        const task = await Task.findOneAndDelete({
            _id: req.params.taskId,
            ...(req.params.boardId
                ? { boardId: req.params.boardId }
                : {}),
            tenantId: req.tenant._id,
        });

        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Task not found",
            });
        }

        await recordActivity({
            req,
            action: "TASK_DELETED",
            entityType: "TASK",
            entityId: task._id,
            metadata: {
                title: task.title,
            },
        });

        req.app.get("io")
            .to(`tenant:${req.tenant._id}`)
            .emit("task:deleted", {
                taskId: task._id,
                boardId: task.boardId,
            });

        return res.status(200).json({
            success: true,
            message: "Task deleted successfully",
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createTask,
    getTasks,
    updateTask,
    deleteTask,
};
