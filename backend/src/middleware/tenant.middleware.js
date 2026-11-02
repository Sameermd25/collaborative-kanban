import Membership from "../models/Membership.js";
import Tenant from "../models/Tenant.js";
import { HttpError } from "../utils/httpError.js";

export const attachTenant = async (req, res, next) => {
  try {
    const tenantId =
      req.params?.tenantId ||
      req.body?.tenantId ||
      req.query?.tenantId;

    if (!tenantId) {
      throw new HttpError(400, "tenantId is required");
    }

    const membership = await Membership.findOne({
      userId: req.user._id,
      tenantId,
      isActive: true
    });

    if (!membership) {
      throw new HttpError(403, "Tenant access denied");
    }

    const tenant = await Tenant.findOne({
      _id: tenantId,
      organizationId: membership.organizationId,
      isActive: true
    });

    if (!tenant) {
      throw new HttpError(404, "Tenant not found");
    }

    req.tenant = tenant;
    req.membership = membership;
    req.organizationId = membership.organizationId;

    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.membership || !roles.includes(req.membership.role)) {
      return next(
        new HttpError(403, "Insufficient permissions")
      );
    }

    next();
  };
};