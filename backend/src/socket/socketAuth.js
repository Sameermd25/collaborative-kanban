const jwt = require("jsonwebtoken");
const cookie = require("cookie");
const User = require("../models/User");

const socketAuth = async (socket, next) => {
  try {
    const cookies = cookie.parse(
      socket.handshake.headers.cookie || ""
    );

    const token = cookies["kanban-token"];

    if (!token) {
      return next(new Error("Authentication required"));
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const user = await User.findById(decoded.id);

    if (!user) {
      return next(new Error("User not found"));
    }

    socket.user = user;

    next();
  } catch (error) {
    next(new Error("Invalid authentication"));
  }
};

module.exports = socketAuth;