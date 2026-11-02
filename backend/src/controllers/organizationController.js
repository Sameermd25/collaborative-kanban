const mongoose = require("mongoose");
const Organization = require("../models/Organization");
const Membership = require("../models/Membership");

const createOrganization = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const { name, slug } = req.body;

    if (!name || !slug) {
      return res.status(400).json({
        message: "Name and slug are required",
      });
    }

    const normalizedSlug = slug.trim().toLowerCase();

    session.startTransaction();

    const organization = await Organization.create(
      [{
        name: name.trim(),
        slug: normalizedSlug,
        ownerId: req.user._id,
      }],
      { session }
    );

    await Membership.create(
      [{
        userId: req.user._id,
        organizationId: organization[0]._id,
        tenantId: null,
        role: "ORG_ADMIN",
      }],
      { session }
    );

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: "Organization created successfully",
      organization: organization[0],
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    await session.endSession();
  }
};

const getOrganizations = async (req, res, next) => {
  try {
    const memberships = await Membership.find({
      userId: req.user._id,
    }).populate("organizationId");

    const organizations = memberships
      .map((membership) => membership.organizationId)
      .filter(Boolean);

    res.status(200).json({
      success: true,
      organizations,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrganization,
  getOrganizations,
};