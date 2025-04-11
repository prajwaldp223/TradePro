const express = require("express")
const router = express.Router()
const mysql = require("mysql2/promise")
const { body, validationResult } = require("express-validator")

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
    console.log("Refreshing user data for wallet page");
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
      ...req.session.user,
      balance: user.balance
    };

    console.log(`Session updated with latest data. Balance: $${req.session.user.balance}`);
    next();
  } catch (error) {
    console.error("Error refreshing user data:", error);
    next();
  }
};

// Wallet page
router.get("/", isAuthenticated, refreshUserData, (req, res) => {
  res.render("wallet/index", {
    title: "Wallet - TradePro",
    user: req.session.user,
  })
})

// Deposit funds
router.post(
  "/deposit",
  [isAuthenticated, body("amount").isFloat({ min: 1 }).withMessage("Amount must be greater than zero")],
  async (req, res) => {
    const errors = validationResult(req)

    if (!errors.isEmpty()) {
      req.flash("error_msg", errors.array()[0].msg)
      return res.redirect("/wallet")
    }

    const amount = Number.parseFloat(req.body.amount)
    console.log(`Deposit requested: $${amount.toFixed(2)} for user ID: ${req.session.user.id}`)

    try {
      // First, get the current balance from database to ensure we have the most up-to-date value
      const [currentUser] = await pool.query(
        "SELECT balance FROM users WHERE id = ?",
        [req.session.user.id]
      )

      if (currentUser.length === 0) {
        throw new Error("User not found")
      }

      const currentBalance = parseFloat(currentUser[0].balance)
      const newBalance = currentBalance + amount

      console.log(`Current balance from DB: $${currentBalance.toFixed(2)}`)
      console.log(`New balance will be: $${newBalance.toFixed(2)}`)

      // Start transaction
      const connection = await pool.getConnection()
      await connection.beginTransaction()

      try {
        // Update user balance
        const updateResult = await connection.query(
          "UPDATE users SET balance = ? WHERE id = ?",
          [newBalance, req.session.user.id]
        )

        console.log(`Database update result:`, updateResult[0].affectedRows === 1 ? 'Success' : 'Failed')

        // Create transaction record
        await connection.query(
          "INSERT INTO transactions (user_id, type, amount, transaction_date) VALUES (?, ?, ?, NOW())",
          [req.session.user.id, "DEPOSIT", amount],
        )

        // Commit transaction
        await connection.commit()
        connection.release()

        // Update session balance with the new calculated balance
        req.session.user.balance = newBalance
        console.log(`Session balance updated to: $${req.session.user.balance.toFixed(2)}`)

        // Save session to ensure it's updated
        req.session.save(err => {
          if (err) {
            console.error("Error saving session:", err)
          }
        })

        req.flash("success_msg", `Successfully deposited $${amount.toFixed(2)}`)
        res.redirect("/wallet")
      } catch (error) {
        await connection.rollback()
        connection.release()
        throw error
      }
    } catch (error) {
      console.error("Error depositing funds:", error)
      req.flash("error_msg", "An error occurred while processing your deposit")
      res.redirect("/wallet")
    }
  },
)

// Withdraw funds
router.post(
  "/withdraw",
  [isAuthenticated, body("amount").isFloat({ min: 1 }).withMessage("Amount must be greater than zero")],
  async (req, res) => {
    const errors = validationResult(req)

    if (!errors.isEmpty()) {
      req.flash("error_msg", errors.array()[0].msg)
      return res.redirect("/wallet")
    }

    const amount = Number.parseFloat(req.body.amount)
    console.log(`Withdrawal requested: $${amount.toFixed(2)} for user ID: ${req.session.user.id}`)

    try {
      // First, get the current balance from database to ensure we have the most up-to-date value
      const [currentUser] = await pool.query(
        "SELECT balance FROM users WHERE id = ?",
        [req.session.user.id]
      )

      if (currentUser.length === 0) {
        throw new Error("User not found")
      }

      const currentBalance = parseFloat(currentUser[0].balance)
      console.log(`Current balance from DB: $${currentBalance.toFixed(2)}`)

      // Check if user has enough balance
      if (currentBalance < amount) {
        console.log(`Insufficient funds: Requested $${amount.toFixed(2)}, Available: $${currentBalance.toFixed(2)}`)
        req.flash("error_msg", "Insufficient funds")
        return res.redirect("/wallet")
      }

      const newBalance = currentBalance - amount
      console.log(`New balance will be: $${newBalance.toFixed(2)}`)

      // Start transaction
      const connection = await pool.getConnection()
      await connection.beginTransaction()

      try {
        // Update user balance
        const updateResult = await connection.query(
          "UPDATE users SET balance = ? WHERE id = ?",
          [newBalance, req.session.user.id]
        )

        console.log(`Database update result:`, updateResult[0].affectedRows === 1 ? 'Success' : 'Failed')

        // Create transaction record
        await connection.query(
          "INSERT INTO transactions (user_id, type, amount, transaction_date) VALUES (?, ?, ?, NOW())",
          [req.session.user.id, "WITHDRAWAL", amount],
        )

        // Commit transaction
        await connection.commit()
        connection.release()

        // Update session balance with the new calculated balance
        req.session.user.balance = newBalance
        console.log(`Session balance updated to: $${req.session.user.balance.toFixed(2)}`)

        // Save session to ensure it's updated
        req.session.save(err => {
          if (err) {
            console.error("Error saving session:", err)
          }
        })

        req.flash("success_msg", `Successfully withdrew $${amount.toFixed(2)}`)
        res.redirect("/wallet")
      } catch (error) {
        await connection.rollback()
        connection.release()
        throw error
      }
    } catch (error) {
      console.error("Error withdrawing funds:", error)
      req.flash("error_msg", "An error occurred while processing your withdrawal")
      res.redirect("/wallet")
    }
  },
)

module.exports = router

