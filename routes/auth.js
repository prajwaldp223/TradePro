const express = require("express")
const router = express.Router()
const bcrypt = require("bcrypt")
const mysql = require("mysql2/promise")
const { body, validationResult } = require("express-validator")

// Get database connection pool from app
const pool = require("../db")

// Login page
router.get("/login", (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard")
  }
  res.render("auth/login", {
    title: "Login - TradePro",
    user: null,
  })
})

// Register page
router.get("/register", (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard")
  }
  res.render("auth/register", {
    title: "Register - TradePro",
    user: null,
  })
})

// Login process
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Please enter a valid email"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req)

    if (!errors.isEmpty()) {
      return res.render("auth/login", {
        title: "Login - TradePro",
        errors: errors.array(),
        email: req.body.email,
        user: null,
      })
    }

    try {
      // First check admin table
      const [admins] = await pool.query("SELECT * FROM admins WHERE email = ?", [req.body.email])

      if (admins.length > 0) {
        // Admin login
        const admin = admins[0]
        const isMatch = await bcrypt.compare(req.body.password, admin.password)

        if (isMatch) {
          // Create admin session
          req.session.admin = {
            id: admin.id,
            username: admin.username,
            email: admin.email,
          }

          req.flash("success_msg", "You are now logged in as admin")
          return res.redirect("/admin/dashboard")
        }
      }

      // If not an admin or admin credentials didn't match, check regular users
      const [users] = await pool.query("SELECT * FROM users WHERE email = ?", [req.body.email])

      if (users.length === 0) {
        return res.render("auth/login", {
          title: "Login - TradePro",
          error_msg: "Invalid email or password",
          email: req.body.email,
          user: null,
        })
      }

      const user = users[0]

      // Check password
      const isMatch = await bcrypt.compare(req.body.password, user.password)
      if (!isMatch) {
        return res.render("auth/login", {
          title: "Login - TradePro",
          error_msg: "Invalid email or password",
          email: req.body.email,
          user: null,
        })
      }

      // Create user session
      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        balance: user.balance,
        profile_picture: user.profile_picture,
      }

      req.flash("success_msg", "You are now logged in")
      res.redirect("/dashboard")
    } catch (error) {
      console.error("Login error:", error)
      res.render("auth/login", {
        title: "Login - TradePro",
        error_msg: "An error occurred during login. Please try again.",
        email: req.body.email,
        user: null,
      })
    }
  },
)

// Register process
router.post(
  "/register",
  [
    body("username").trim().isLength({ min: 3 }).withMessage("Username must be at least 3 characters"),
    body("email").isEmail().withMessage("Please enter a valid email"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("confirm_password").custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Passwords do not match")
      }
      return true
    }),
  ],
  async (req, res) => {
    const errors = validationResult(req)

    if (!errors.isEmpty()) {
      return res.render("auth/register", {
        title: "Register - TradePro",
        errors: errors.array(),
        username: req.body.username,
        email: req.body.email,
        user: null,
      })
    }

    try {
      // Check if email already exists
      const [existingUsers] = await pool.query("SELECT * FROM users WHERE email = ?", [req.body.email])

      if (existingUsers.length > 0) {
        return res.render("auth/register", {
          title: "Register - TradePro",
          error_msg: "Email is already registered",
          username: req.body.username,
          email: req.body.email,
          user: null,
        })
      }

      // Hash password
      const salt = await bcrypt.genSalt(10)
      const hashedPassword = await bcrypt.hash(req.body.password, salt)

      // Start transaction
      const connection = await pool.getConnection()
      await connection.beginTransaction()

      try {
        // Insert new user with starting balance of 10000
        const [result] = await connection.query(
          "INSERT INTO users (username, email, password, balance) VALUES (?, ?, ?, ?)",
          [req.body.username, req.body.email, hashedPassword, 10000]
        )

        // Create session
        req.session.user = {
          id: result.insertId,
          username: req.body.username,
          email: req.body.email,
          balance: 10000,
        }

        await connection.commit()
        connection.release()

        req.flash("success_msg", "You are now registered and logged in")
        res.redirect("/dashboard")
      } catch (error) {
        await connection.rollback()
        connection.release()
        throw error
      }
    } catch (error) {
      console.error("Registration error:", error)
      res.render("auth/register", {
        title: "Register - TradePro",
        error_msg: "An error occurred during registration. Please try again.",
        username: req.body.username,
        email: req.body.email,
        user: null,
      })
    }
  },
)

// Logout
router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err)
    }
    res.redirect("/")
  })
})

module.exports = router

