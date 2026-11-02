import ActivityLog from "../models/ActivityLog.js";
import { emitToTenant } from "../socket/index.js";

export const logActivity = async ({
  req,
  action,
  message,
  boardId = null,
  taskId = null,
  metadata = {}
}) => {
  const activity = await ActivityLog.create({
    organizationId: req.organizationId,
    tenantId: req.tenant._id,
    boardId,
    taskId,
    actorId: req.user._id,
    action,
    message,
    metadata
  });

  emitToTenant(
    req.tenant._id,
    "activity:new",
    activity
  );

  return activity;
};