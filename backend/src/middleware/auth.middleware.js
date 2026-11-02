import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { HttpError } from "../utils/httpError.js";

export const protect = async (req, res, next) => {
  try {
    const headerToken = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null;

    const token = headerToken || req.cookies?.token;

    if (!token) {
      throw new HttpError(401, "Authentication required");
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const user = await User.findById(decoded.sub)
      .select("-password");

    if (!user || !user.isActive) {
      throw new HttpError(401, "User unavailable");
    }

    req.user = user;
    next();
  } catch (error) {
    next(
      error instanceof HttpError
        ? error
        : new HttpError(401, "Invalid or expired token")
    );
  }
};