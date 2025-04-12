const express = require("express")
const router = express.Router()
const mysql = require("mysql2/promise")
const bcrypt = require("bcrypt")
const { body, validationResult } = require("express-validator")
const multer = require("multer")
const path = require("path")
const fs = require("fs")

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../public/uploads/profile')
    // Create the directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    // Create a unique filename with user id and timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, 'profile-' + req.session.user.id + '-' + uniqueSuffix + ext)
  }
})

// Create multer upload middleware with file size and type validation
const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 }, // 1MB
  fileFilter: function (req, file, cb) {
    // Check file type
    const filetypes = /jpeg|jpg|png|gif/
    const mimetype = filetypes.test(file.mimetype)
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase())

    if (mimetype && extname) {
      return cb(null, true)
    }
    cb(new Error('Only image files (jpg, jpeg, png, gif) are allowed'))
  }
}).single('profile_picture'); // <-- Configure multer to expect a single file with field name 'profile_picture'

// Get database connection pool from app
const pool = require("../db")

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next()
  }
  req.flash("error_msg", "Please log in to access this page")
  res.redirect("/auth/login")
}

// Middleware to refresh user data from database
const refreshUserData = async (req, res, next) => {
  if (!req.session.user) {
    return next();
  }

  try {
    console.log("Refreshing user data from database");
    const [users] = await pool.query("SELECT * FROM users WHERE id = ?", [req.session.user.id]);

    if (users.length === 0) {
      req.flash("error_msg", "User not found");
      return res.redirect("/auth/logout");
    }

    const user = users[0];
    console.log(`Current session balance: $${req.session.user.balance}`);
    console.log(`Database balance: $${user.balance}`);

    // Update session with the latest user data
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      balance: user.balance,
      profile_picture: user.profile_picture
    };

    console.log(`Session updated with latest data. Balance: $${req.session.user.balance}`);
    next();
  } catch (error) {
    console.error("Error refreshing user data:", error);
    next();
  }
};

// Profile page
router.get("/", isAuthenticated, refreshUserData, async (req, res) => {
  try {
    res.render("profile/index", {
      title: "Profile - TradePro",
      user: req.session.user,
    })
  } catch (error) {
    console.error("Error rendering profile:", error)
    req.flash("error_msg", "An error occurred while loading your profile")
    res.redirect("/")
  }
})

// Update profile
router.post(
  "/",
  [
    isAuthenticated,
    body("username").trim().isLength({ min: 3 }).withMessage("Username must be at least 3 characters"),
    body("email").isEmail().withMessage("Please enter a valid email"),
  ],
  async (req, res) => {
    const errors = validationResult(req)

    if (!errors.isEmpty()) {
      return res.render("profile/index", {
        title: "Profile - TradePro",
        user: req.session.user,
        errors: errors.array(),
      })
    }

    try {
      // Check if email is already taken by another user
      const [existingUsers] = await pool.query("SELECT * FROM users WHERE email = ? AND id != ?", [
        req.body.email,
        req.session.user.id,
      ])

      if (existingUsers.length > 0) {
        return res.render("profile/index", {
          title: "Profile - TradePro",
          user: req.session.user,
          error_msg: "Email is already in use by another account",
        })
      }

      // Update user
      await pool.query("UPDATE users SET username = ?, email = ? WHERE id = ?", [
        req.body.username,
        req.body.email,
        req.session.user.id,
      ])

      // Update session
      req.session.user.username = req.body.username
      req.session.user.email = req.body.email

      req.flash("success_msg", "Profile updated successfully")
      res.redirect("/profile")
    } catch (error) {
      console.error("Error updating profile:", error)
      req.flash("error_msg", "An error occurred while updating your profile")
      res.redirect("/profile")
    }
  },
)

// Handle profile picture upload - Fixed direct approach
router.post("/upload-profile-picture", isAuthenticated, async (req, res) => {
  console.log("Profile picture upload started");

  // Process the upload
  upload(req, res, async function (err) {
    if (err) {
      console.error("Multer error:", err);
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          req.flash("error_msg", "File is too large. Maximum size is 1MB.");
        } else {
          req.flash("error_msg", `Upload error: ${err.code}`);
        }
      } else {
        req.flash("error_msg", err.message || "Error uploading file");
      }
      return res.redirect("/profile");
    }

    // Check if file exists
    if (!req.file) {
      console.error("No file uploaded");
      req.flash("error_msg", "No file was uploaded. Please select an image.");
      return res.redirect("/profile");
    }

    try {
      console.log("File uploaded:", req.file.filename);

      // Path to store in database
      const relativePath = `/uploads/profile/${req.file.filename}`;

      // Delete old profile picture if it exists
      if (req.session.user.profile_picture) {
        try {
          const oldPath = path.join(__dirname, '../public', req.session.user.profile_picture);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
            console.log("Deleted old profile picture");
          }
        } catch (e) {
          console.error("Error deleting old picture:", e);
          // Continue anyway
        }
      }

      // Update database
      await pool.query(
        "UPDATE users SET profile_picture = ? WHERE id = ?",
        [relativePath, req.session.user.id]
      );

      // Update session
      req.session.user.profile_picture = relativePath;

      // Save session changes
      req.session.save(err => {
        if (err) {
          console.error("Error saving session:", err);
        }
        req.flash("success_msg", "Profile picture updated successfully!");
        return res.redirect("/profile");
      });
    } catch (error) {
      console.error("Database error:", error);
      req.flash("error_msg", "Error saving profile picture to database");
      return res.redirect("/profile");
    }
  });
});

// Change password
router.post(
  "/change-password",
  [
    isAuthenticated,
    body("current_password").notEmpty().withMessage("Current password is required"),
    body("new_password").isLength({ min: 6 }).withMessage("New password must be at least 6 characters"),
    body("confirm_password").custom((value, { req }) => {
      if (value !== req.body.new_password) {
        throw new Error("Passwords do not match")
      }
      return true
    }),
  ],
  async (req, res) => {
    const errors = validationResult(req)

    if (!errors.isEmpty()) {
      return res.render("profile/index", {
        title: "Profile - TradePro",
        user: req.session.user,
        passwordErrors: errors.array(),
      })
    }

    try {
      // Get user with password
      const [users] = await pool.query("SELECT * FROM users WHERE id = ?", [req.session.user.id])

      if (users.length === 0) {
        req.flash("error_msg", "User not found")
        return res.redirect("/profile")
      }

      const user = users[0]

      // Check current password
      const isMatch = await bcrypt.compare(req.body.current_password, user.password)

      if (!isMatch) {
        return res.render("profile/index", {
          title: "Profile - TradePro",
          user: req.session.user,
          password_error: "Current password is incorrect",
        })
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10)
      const hashedPassword = await bcrypt.hash(req.body.new_password, salt)

      // Update password
      await pool.query("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, req.session.user.id])

      req.flash("success_msg", "Password changed successfully")
      res.redirect("/profile")
    } catch (error) {
      console.error("Error changing password:", error)
      req.flash("error_msg", "An error occurred while changing your password")
      res.redirect("/profile")
    }
  },
)

module.exports = router

