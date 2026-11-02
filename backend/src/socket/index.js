import { Server } from "socket.io";
import jwt from "jsonwebtoken";

import User from "../models/User.js";
import Membership from "../models/Membership.js";

let io;

export const initializeSocket = (server) => {
  const origins = (process.env.CLIENT_URL ||
    "http://localhost:5173").split(",").map(s => s.trim());

  io = new Server(server, {
    cors: {
      origin: origins,
      credentials: true
    }
  });

  // Authenticate socket connection
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET
      );

      const user = await User.findById(decoded.sub);

      if (!user || !user.isActive) {
        return next(new Error("Unauthorized"));
      }

      socket.user = user;
      next();

    } catch {
      next(new Error("Invalid socket token"));
    }
  });

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.user.name);

    // Join tenant-specific room
    socket.on("tenant:join", async ({ tenantId } = {}, callback = () => {}) => {
      try {
        if (!tenantId) {
          return callback({
            success: false,
            message: "tenantId required"
          });
        }

        const membership = await Membership.findOne({
          userId: socket.user._id,
          tenantId,
          isActive: true
        });

        if (!membership) {
          return callback({
            success: false,
            message: "Tenant access denied"
          });
        }

        const room = `tenant:${tenantId}`;

        socket.join(room);

        const sockets = await io.in(room).fetchSockets();

        const onlineUsers = [
          ...new Map(
            sockets.map((s) => [
              String(s.user?._id),
              {
                userId: String(s.user?._id),
                name: s.user?.name
              }
            ])
          ).values()
        ];

        io.to(room).emit("presence:update", onlineUsers);

        callback({
          success: true,
          tenantId,
          onlineUsers
        });

      } catch {
        callback({
          success: false,
          message: "Unable to join tenant room"
        });
      }
    });

    socket.on("tenant:leave", ({ tenantId } = {}) => {
      if (tenantId) {
        socket.leave(`tenant:${tenantId}`);
      }
    });

    socket.on("disconnect", async () => {
      for (const room of socket.rooms) {
        if (!room.startsWith("tenant:")) continue;

        const sockets = await io.in(room).fetchSockets();

        const onlineUsers = [
          ...new Map(
            sockets.map((s) => [
              String(s.user?._id),
              {
                userId: String(s.user?._id),
                name: s.user?.name
              }
            ])
          ).values()
        ];

        io.to(room).emit("presence:update", onlineUsers);
      }

      console.log("Socket disconnected:", socket.user.name);
    });
  });

  return io;
};

// Emit event to users in a particular tenant
export const emitToTenant = (tenantId, event, data) => {
  if (io) {
    io.to(`tenant:${tenantId}`).emit(event, data);
  }
};