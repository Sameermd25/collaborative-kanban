const Board = require("../models/Board");
const Column = require("../models/Column");

const createBoard = async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        message: "Board name is required",
      });
    }

    const board = await Board.create({
      organizationId: req.tenant.organizationId,
      tenantId: req.tenant._id,
      name: name.trim(),
      description: description || "",
      createdBy: req.user._id,
    });

    // Create default columns
    await Column.insertMany([
      {
        organizationId: req.tenant.organizationId,
        tenantId: req.tenant._id,
        boardId: board._id,
        name: "To Do",
        position: 0,
      },
      {
        organizationId: req.tenant.organizationId,
        tenantId: req.tenant._id,
        boardId: board._id,
        name: "In Progress",
        position: 1,
      },
      {
        organizationId: req.tenant.organizationId,
        tenantId: req.tenant._id,
        boardId: board._id,
        name: "Done",
        position: 2,
      },
    ]);

    res.status(201).json({
      success: true,
      board,
    });
  } catch (error) {
    next(error);
  }
};

const getBoards = async (req, res, next) => {
  try {
    const boards = await Board.find({
      tenantId: req.tenant._id,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      boards,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createBoard,
  getBoards,
};