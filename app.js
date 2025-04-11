const express = require("express")
const path = require("path")
const mysql = require("mysql2/promise")
const session = require("express-session")
const bcrypt = require("bcrypt")
const methodOverride = require("method-override")
const flash = require("connect-flash")
const MySQLStore = require('express-mysql-session')(session)
const expressLayouts = require('express-ejs-layouts')

// Create Express app
const app = express()
const PORT = process.env.PORT || 3000

// Database connection pool
const pool = require("./db")

// Middleware
app.set("view engine", "ejs")
app.set("views", path.join(__dirname, "views"))
app.use(expressLayouts)
app.set("layout", "layouts/default") // Default layout
app.set("layout extractScripts", true)
app.set("layout extractStyles", true)
app.use(express.static(path.join(__dirname, "public")))
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(methodOverride("_method"))

// Session store configuration
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "", // Empty password or try your actual MySQL password
  database: process.env.DB_NAME || "trading_new",
  createDatabaseTable: true
})

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || "trading_platform_secret",
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'lax'
  },
}))

// Flash messages
app.use(flash())

// Global variables middleware
app.use((req, res, next) => {
  res.locals.user = req.session.user || null
  res.locals.admin = req.session.admin || null
  res.locals.success_msg = req.flash("success_msg")
  res.locals.error_msg = req.flash("error_msg")
  next()
})

// Global middleware to refresh user data on every request
app.use(async (req, res, next) => {
  // Only fetch fresh data if the user is logged in
  if (req.session.user) {
    try {
      const [users] = await pool.query("SELECT * FROM users WHERE id = ?", [req.session.user.id])

      if (users.length > 0) {
        const user = users[0]

        // Update critical data in the session
        req.session.user = {
          ...req.session.user,
          balance: user.balance, // Ensure balance is always up-to-date
          profile_picture: user.profile_picture
        }

        // Also update in res.locals for immediate template access
        res.locals.user = req.session.user
      }
    } catch (error) {
      console.error("Error refreshing user data in global middleware:", error)
      // Continue to next middleware even if there's an error
    }
  }
  next()
})

// Routes
const authRoutes = require("./routes/auth")
const stockRoutes = require("./routes/stocks")
const portfolioRoutes = require("./routes/portfolio")
const walletRoutes = require("./routes/wallet")
const transactionRoutes = require("./routes/transactions")
const profileRoutes = require("./routes/profile")
const adminRoutes = require("./routes/admin")

app.use("/auth", authRoutes)
app.use("/stocks", stockRoutes)
app.use("/portfolio", portfolioRoutes)
app.use("/wallet", walletRoutes)
app.use("/transactions", transactionRoutes)
app.use("/profile", profileRoutes)
app.use("/admin", adminRoutes)

// Home route
app.get("/", (req, res) => {
  res.render("index", {
    title: "TradePro - Stock Trading Platform",
    user: req.session.user,
  })
})

// Dashboard route (protected)
app.get("/dashboard", async (req, res) => {
  if (!req.session.user) {
    req.flash("error_msg", "Please log in to access the dashboard")
    return res.redirect("/auth/login")
  }

  try {
    // Get stocks data
    const [stocks] = await pool.query("SELECT * FROM stocks LIMIT 3")

    // Get user portfolio
    const [holdings] = await pool.query(
      "SELECT h.*, s.name, s.price, s.change, s.change_percent FROM holdings h " +
      "JOIN stocks s ON h.stock_id = s.id " +
      "WHERE h.user_id = ? LIMIT 3",
      [req.session.user.id],
    )

    res.render("dashboard", {
      title: "Dashboard - TradePro",
      user: req.session.user,
      stocks,
      holdings,
    })
  } catch (error) {
    console.error("Dashboard error:", error)
    req.flash("error_msg", "Error loading dashboard data")
    res.redirect("/")
  }
})

// 404 route
app.use((req, res) => {
  res.status(404).render("404", {
    title: "Page Not Found",
    user: req.session.user,
  })
})

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).render("error", {
    title: "Server Error",
    user: req.session.user,
    error: process.env.NODE_ENV === "production" ? "An error occurred" : err.message,
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Local URL: http://localhost:${PORT}`)
})

module.exports = app

