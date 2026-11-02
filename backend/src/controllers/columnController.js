const Column = require("../models/Column");
const Board = require("../models/Board");

const createColumn = async (req, res, next) => {
  try {
    const { name } = req.body;
    const { boardId } = req.params;

    if (!name?.trim()) {
      return res.status(400).json({
        message: "Column name is required",
      });
    }

    const board = await Board.findOne({
      _id: boardId,
      tenantId: req.tenant._id,
      organizationId: req.tenant.organizationId,
    });

    if (!board) {
      return res.status(404).json({
        message: "Board not found",
      });
    }

    const lastColumn = await Column.findOne({
      boardId,
      tenantId: req.tenant._id,
    }).sort({ position: -1 });

    const column = await Column.create({
      organizationId: req.tenant.organizationId,
      tenantId: req.tenant._id,
      boardId,
      name: name.trim(),
      position: lastColumn ? lastColumn.position + 1 : 0,
    });

    res.status(201).json({
      success: true,
      column,
    });
  } catch (error) {
    next(error);
  }
};

const getColumns = async (req, res, next) => {
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

    const columns = await Column.find({
      boardId,
      tenantId: req.tenant._id,
    }).sort({ position: 1 });

    res.status(200).json({
      success: true,
      columns,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createColumn,
  getColumns,
};