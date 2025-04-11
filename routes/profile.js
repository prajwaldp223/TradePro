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
})

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

// Handle profile picture upload
router.post("/upload-profile-picture", isAuthenticated, (req, res) => {
  console.log("====== PROFILE PICTURE UPLOAD STARTED ======");
  console.log("Content-Type:", req.headers['content-type']);
  console.log("Session user:", req.session.user ? req.session.user.id : 'No session user');

  // Ensure upload directory exists
  const uploadDir = path.join(__dirname, '../public/uploads/profile');
  console.log("Upload directory path:", uploadDir);

  if (!fs.existsSync(uploadDir)) {
    try {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log("Created upload directory:", uploadDir);
    } catch (err) {
      console.error("Error creating upload directory:", err);
      req.flash("error_msg", "Error creating upload directory");
      return res.redirect("/profile");
    }
  } else {
    console.log("Upload directory already exists");
  }

  // Process file upload with proper error handling
  try {
    // Use multer middleware to process the file upload
    upload.single('profile_picture')(req, res, async function (err) {
      if (err) {
        console.error("File upload error:", err);

        if (err.code === 'LIMIT_FILE_SIZE') {
          req.flash("error_msg", "File too large. Maximum size is 1MB.");
        } else {
          req.flash("error_msg", err.message || "Error uploading profile picture");
        }

        return res.redirect("/profile");
      }

      // Check if file was uploaded
      if (!req.file) {
        console.error("No file data in request");
        console.log("Request body:", req.body);
        req.flash("error_msg", "No file was uploaded. Please select a file first.");
        return res.redirect("/profile");
      }

      try {
        // Get file details
        console.log("File upload successful:", {
          originalname: req.file.originalname,
          filename: req.file.filename,
          size: req.file.size,
          mimetype: req.file.mimetype,
          path: req.file.path
        });

        // Format path for database - ensure it's URL friendly
        const relativePath = `/uploads/profile/${req.file.filename}`;
        console.log("Relative path for database:", relativePath);

        // Remove old profile picture if exists to save disk space
        if (req.session.user.profile_picture) {
          try {
            const oldPath = path.join(__dirname, '../public', req.session.user.profile_picture);
            console.log("Old profile picture path:", oldPath);

            if (fs.existsSync(oldPath)) {
              fs.unlinkSync(oldPath);
              console.log("Old profile picture deleted");
            } else {
              console.log("Old profile picture file not found");
            }
          } catch (error) {
            console.error("Error deleting old profile picture:", error);
            // Continue even if delete fails
          }
        } else {
          console.log("No previous profile picture to delete");
        }

        // Start a database connection and transaction for updating profile picture
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
          // Update database with new profile picture path
          console.log("Updating database with new profile picture path");
          await connection.query("UPDATE users SET profile_picture = ? WHERE id = ?", [
            relativePath,
            req.session.user.id
          ]);

          // Commit the transaction
          await connection.commit();
          connection.release();

          // Update session with new profile picture path
          req.session.user.profile_picture = relativePath;
          console.log("Session updated with new profile picture path:", relativePath);

          // Save session to ensure it's updated
          req.session.save(err => {
            if (err) {
              console.error("Error saving session:", err);
            }
          });

          req.flash("success_msg", "Profile picture updated successfully");
          console.log("====== PROFILE PICTURE UPLOAD COMPLETED ======");
          res.redirect("/profile");

        } catch (dbError) {
          // Rollback transaction if database update fails
          await connection.rollback();
          connection.release();
          throw dbError;
        }

      } catch (error) {
        console.error("Database error updating profile picture:", error);
        req.flash("error_msg", "Error updating profile picture in database");
        res.redirect("/profile");
      }
    });
  } catch (multerError) {
    console.error("Multer initialization error:", multerError);
    req.flash("error_msg", "Server error processing upload");
    res.redirect("/profile");
  }
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

