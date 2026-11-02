const Task = require("../models/Task");
const Board = require("../models/Board");
const Column = require("../models/Column");
const Membership = require("../models/Membership");
const recordActivity = require("../services/activity.service");

const createTask = async (req, res, next) => {
    try {
        const { boardId, columnId } = req.params;
        const {
            title,
            description,
            priority,
            assignedTo,
        } = req.body;

        if (!title?.trim()) {
            return res.status(400).json({
                message: "Task title is required",
            });
        }

        const board = await Board.findOne({
            _id: boardId,
            tenantId: req.tenant._id,
        });

        if (!board) {
            return res.status(404).json({
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
                message: "Column not found",
            });
        }

        const userIds = [...new Set(assignedTo || [])];

        if (userIds.length) {
            const memberships = await Membership.find({
                userId: { $in: userIds },
                organizationId: req.tenant.organizationId,
                tenantId: req.tenant._id,
                role: { $in: ["TENANT_ADMIN", "MEMBER"] },
            });

            if (memberships.length !== userIds.length) {
                return res.status(400).json({
                    message: "One or more assignees do not belong to this tenant",
                });
            }
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
            description: description || "",
            priority: priority || "MEDIUM",
            assignedTo: userIds,
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

        req.app.get("io")
            .to(`tenant:${req.tenant._id}`)
            .emit("task:created", task);

        res.status(201).json({
            success: true,
            task,
        });
    } catch (error) {
        next(error);
    }
};


const getTasks = async (req, res, next) => {
    try {
        const { boardId } = req.params;

        const board = await Board.findOne({
            _id: boardId,
            tenantId: req.tenant._id,
        });

        if (!board) {
            return res.status(404).json({
                message: "Board not found",
            });
        }

        const tasks = await Task.find({
            boardId,
            tenantId: req.tenant._id,
        })
            .populate("assignedTo", "name email")
            .sort({ position: 1 });





        res.status(200).json({
            success: true,
            tasks,
        });
    } catch (error) {
        next(error);
    }
};

// Optimistic concurrency using an explicit version
const updateTask = async (req, res, next) => {
    try {
        const { taskId } = req.params;
        const { version, assignedTo, ...updates } = req.body;

        if (!Number.isInteger(version) || version < 0) {
            return res.status(400).json({
                message: "A valid task version is required",
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
                    message: "Task title cannot be empty",
                });
            }

            safeUpdates.title = safeUpdates.title.trim();
        }

        if (
            safeUpdates.priority !== undefined &&
            !["LOW", "MEDIUM", "HIGH"].includes(safeUpdates.priority)
        ) {
            return res.status(400).json({
                message: "Invalid priority",
            });
        }

        if (assignedTo !== undefined) {
            if (
                !Array.isArray(assignedTo) ||
                assignedTo.some((id) => !require("mongoose").isValidObjectId(id))
            ) {
                return res.status(400).json({
                    message: "Invalid assignee list",
                });
            }

            const userIds = [...new Set(assignedTo)];

            const memberships = await Membership.find({
                userId: { $in: userIds },
                organizationId: req.tenant.organizationId,
                tenantId: req.tenant._id,
                role: { $in: ["TENANT_ADMIN", "MEMBER"] },
            });

            if (memberships.length !== userIds.length) {
                return res.status(400).json({
                    message: "Invalid tenant assignee",
                });
            }

            safeUpdates.assignedTo = userIds;
        }

        if (safeUpdates.columnId !== undefined) {
            const column = await Column.findOne({
                _id: safeUpdates.columnId,
                boardId: req.params.boardId,
                tenantId: req.tenant._id,
            });

            if (!column) {
                return res.status(400).json({
                    message: "Target column is invalid",
                });
            }
        }

        const task = await Task.findOneAndUpdate(
            {
                _id: taskId,
                boardId: req.params.boardId,
                tenantId: req.tenant._id,
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
        );

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

        res.status(200).json({
            success: true,
            task,
        });
    } catch (error) {
        next(error);
    }
};

const deleteTask = async (req, res, next) => {
    try {
        const task = await Task.findOneAndDelete({
            _id: req.params.taskId,
            boardId: req.params.boardId,
            tenantId: req.tenant._id,
        });

        if (!task) {
            return res.status(404).json({
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

        res.status(200).json({
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