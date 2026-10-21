import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select("-password");

      if (!req.user) {
        return res.status(401).json({ message: "User no longer exists" });
      }

      return next();
    } catch (err) {
      // Only log unexpected errors — expired/invalid tokens are routine
      if (err.name !== "TokenExpiredError" && err.name !== "JsonWebTokenError") {
        console.error("JWT verify error:", err.name, err.message);
      }

      const message =
        err.name === "TokenExpiredError"
          ? "Token expired, please log in again"
          : "Not authorized, token invalid";

      return res.status(401).json({ message });
    }
  }

  return res.status(401).json({ message: "Not authorized, no token" });
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authorized, no user" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Role '${req.user.role}' is not permitted for this action`,
      });
    }

    next();
  };
};