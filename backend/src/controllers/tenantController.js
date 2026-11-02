const Tenant = require("../models/Tenant");

const createTenant = async (req, res, next) => {
  try {
    const { name, slug } = req.body;

    if (!name || !slug) {
      return res.status(400).json({
        message: "Tenant name and slug are required",
      });
    }

    const tenant = await Tenant.create({
      organizationId: req.organization._id,
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
    });

    res.status(201).json({
      success: true,
      message: "Tenant created successfully",
      tenant,
    });
  } catch (error) {
    next(error);
  }
};

const getTenants = async (req, res, next) => {
  try {
    const tenants = await Tenant.find({
      organizationId: req.organization._id,
    });

    res.status(200).json({
      success: true,
      tenants,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTenant,
  getTenants,
};