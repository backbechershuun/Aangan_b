// backend/controllers/updateProfile.js
// PUT /api/auth/me  { name, phone }
//
// Assumes: Express + Mongoose, an auth middleware (`protect`) that sets req.user,
// and a User model with name, email, phone, role, createdAt.
// ES modules shown. For CommonJS swap `import/export` for `require/module.exports`.

import mongoose from "mongoose";
import User from "../models/User.js";

/* ----------------------------------------------------------------------------
   Validation (mirrors the frontend rules so both sides agree)
   -------------------------------------------------------------------------- */

const PHONE_RE = /^(\+91[\s-]?)?[6-9]\d{9}$/;

// Only these fields can ever be changed through this route.
// email, role, password, _id etc. are ignored even if sent.
const ALLOWED_FIELDS = ["name", "phone"];

const normalizePhone = (raw) => {
  const compact = String(raw).replace(/[\s-]/g, "");
  // Store as plain 10 digits: strip +91 / 91 prefix
  return compact.replace(/^\+?91(?=[6-9]\d{9}$)/, "");
};

const validate = (body) => {
  const errors = {};
  const clean = {};

  if (body.name !== undefined) {
    const name = String(body.name).replace(/\s+/g, " ").trim();
    if (name.length < 2) errors.name = "Please enter your full name.";
    else if (name.length > 60) errors.name = "Name must be 60 characters or fewer.";
    else clean.name = name;
  }

  if (body.phone !== undefined) {
    const phone = String(body.phone).trim();
    if (phone === "") {
      clean.phone = ""; // allow clearing the number
    } else if (!PHONE_RE.test(phone.replace(/\s/g, ""))) {
      errors.phone = "Enter a valid 10-digit Indian mobile number.";
    } else {
      clean.phone = normalizePhone(phone);
    }
  }

  return { errors, clean };
};

/* ----------------------------------------------------------------------------
   Controller
   -------------------------------------------------------------------------- */

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(401).json({ message: "Not authorised." });
    }

    // Drop anything we don't explicitly allow
    const incoming = Object.fromEntries(
      Object.entries(req.body || {}).filter(([k]) => ALLOWED_FIELDS.includes(k))
    );

    if (Object.keys(incoming).length === 0) {
      return res.status(400).json({ message: "Nothing to update." });
    }

    const { errors, clean } = validate(incoming);
    if (Object.keys(errors).length > 0) {
      // First error as `message` (the frontend shows this), full map as `errors`
      return res.status(400).json({ message: Object.values(errors)[0], errors });
    }

    // Optional: block a phone number already used by another account.
    // Remove this block if phone isn't meant to be unique.
    if (clean.phone) {
      const taken = await User.exists({ phone: clean.phone, _id: { $ne: userId } });
      if (taken) {
        return res.status(409).json({
          message: "That mobile number is already linked to another account.",
          errors: { phone: "Already in use." },
        });
      }
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: clean },
      { new: true, runValidators: true }
    ).select("-password -__v");

    if (!updated) {
      return res.status(404).json({ message: "User not found." });
    }

    // Return the user object flat. The frontend does applyUser({ ...user, ...data }).
    return res.status(200).json(updated);
  } catch (err) {
    // Mongoose schema validation failures
    if (err.name === "ValidationError") {
      const first = Object.values(err.errors)[0]?.message || "Invalid data.";
      return res.status(400).json({ message: first });
    }
    // Unique index race (two requests set the same phone at once)
    if (err.code === 11000) {
      return res.status(409).json({ message: "That mobile number is already linked to another account." });
    }
    console.error("updateProfile error:", err);
    return res.status(500).json({ message: "Couldn't save your changes. Please try again." });
  }
};

/* ----------------------------------------------------------------------------
   Wire it up in backend/routes/authRoutes.js
   -------------------------------------------------------------------------- */
//
//   import express from "express";
//   import { protect } from "../middleware/authMiddleware.js";
//   import { updateProfile } from "../controllers/updateProfile.js";
//
//   const router = express.Router();
//   router.put("/me", protect, updateProfile);
//   export default router;
//
//   // server.js
//   app.use("/api/auth", authRoutes);
//
// If your axios baseURL already includes /api, the frontend's "/auth/me" matches this.
//
// Schema reminder (models/User.js):
//   phone: { type: String, trim: true, default: "" }
//   // for uniqueness, use a partial index so empty strings don't collide:
//   userSchema.index(
//     { phone: 1 },
//     { unique: true, partialFilterExpression: { phone: { $type: "string", $gt: "" } } }
//   );