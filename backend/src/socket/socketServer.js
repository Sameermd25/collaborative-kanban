const { Server } = require("socket.io");
const Membership = require("../models/Membership");
const Tenant = require("../models/Tenant");
const socketAuth = require("./socketAuth");

const initializeSocket = (server, app) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Authenticate every connection
  io.use(socketAuth);

  // Track connected users per tenant room
  const presence = new Map();

  io.on("connection", (socket) => {
    console.log("Connected:", socket.user.name);

    socket.on("tenant:join", async ({ organizationId, tenantId }, callback) => {
      try {
        const tenant = await Tenant.findOne({
          _id: tenantId,
          organizationId,
        });

        if (!tenant) {
          return callback?.({
            success: false,
            message: "Tenant not found",
          });
        }

        // Verify tenant membership or organization admin access
        const membership = await Membership.findOne({
          userId: socket.user._id,
          organizationId,
          $or: [
            { tenantId },
            { tenantId: null, role: "ORG_ADMIN" },
          ],
        });

        if (!membership) {
          return callback?.({
            success: false,
            message: "Access denied",
          });
        }

        const room = `tenant:${tenantId}`;

        // Leave any previous tenant room
        for (const joinedRoom of socket.rooms) {
          if (joinedRoom.startsWith("tenant:")) {
            socket.leave(joinedRoom);

            const users = presence.get(joinedRoom);

            if (users) {
              users.delete(socket.id);

              if (users.size === 0) {
                presence.delete(joinedRoom);
              } else {
                io.to(joinedRoom).emit(
                  "presence:update",
                  Array.from(users.values())
                );
              }
            }
          }
        }

        socket.join(room);

        if (!presence.has(room)) {
          presence.set(room, new Map());
        }

        presence.get(room).set(socket.id, {
          id: socket.user._id.toString(),
          name: socket.user.name,
        });

        socket.data.tenantRoom = room;

        io.to(room).emit(
          "presence:update",
          Array.from(presence.get(room).values())
        );

        callback?.({
          success: true,
          message: "Joined tenant room",
        });
      } catch (error) {
        console.error("Tenant join error:", error.message);

        callback?.({
          success: false,
          message: "Unable to join tenant room",
        });
      }
    });

    socket.on("disconnect", () => {
      const room = socket.data.tenantRoom;

      if (room && presence.has(room)) {
        const users = presence.get(room);

        users.delete(socket.id);

        if (users.size === 0) {
          presence.delete(room);
        } else {
          io.to(room).emit(
            "presence:update",
            Array.from(users.values())
          );
        }
      }

      console.log("Disconnected:", socket.user.name);
    });
  });

  app.set("io", io);

  return io;
};

module.exports = initializeSocket;