const Membership = require("../models/Membership");
const Organization = require("../models/Organization");

const checkOrganizationAccess = async (req, res, next) => {
  try {
    const { organizationId } = req.params;

    const organization = await Organization.findById(organizationId);

    if (!organization) {
      return res.status(404).json({
        success: false,
        message: "Organization not found",
      });
    }

    const membership = await Membership.findOne({
      userId: req.user._id,
      organizationId,
      tenantId: null,
      role: "ORG_ADMIN",
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: "Organization admin access required",
      });
    }

    req.organization = organization;
    req.membership = membership;

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = checkOrganizationAccess;