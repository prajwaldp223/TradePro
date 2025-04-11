const express = require("express")
const router = express.Router()
const mysql = require("mysql2/promise")
const bcrypt = require("bcrypt")
const { body, validationResult } = require("express-validator")

// Get database connection pool from app
const pool = require("../db")

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
    if (req.session.admin) {
        return next()
    }
    req.flash("error_msg", "Please log in as admin to access this page")
    res.redirect("/admin/login")
}

// Admin login page
router.get("/login", (req, res) => {
    if (req.session.admin) {
        return res.redirect("/admin/dashboard")
    }
    res.redirect("/auth/login")
})

// Admin dashboard
router.get("/dashboard", isAdmin, async (req, res) => {
    try {
        // Get stats for dashboard
        const [userCount] = await pool.query("SELECT COUNT(*) as count FROM users")
        const [stockCount] = await pool.query("SELECT COUNT(*) as count FROM stocks")
        const [transactionCount] = await pool.query("SELECT COUNT(*) as count FROM transactions")

        res.render("admin/dashboard", {
            title: "Admin Dashboard - TradePro",
            layout: "layouts/admin",
            admin: req.session.admin,
            stats: {
                users: userCount[0].count,
                stocks: stockCount[0].count,
                transactions: transactionCount[0].count
            }
        })
    } catch (error) {
        console.error("Admin dashboard error:", error)
        req.flash("error_msg", "Error loading dashboard data")
        res.redirect("/admin/dashboard")
    }
})

// Manage Users
router.get("/users", isAdmin, async (req, res) => {
    try {
        const [users] = await pool.query("SELECT * FROM users ORDER BY created_at DESC")

        res.render("admin/users", {
            title: "Manage Users - TradePro Admin",
            layout: "layouts/admin",
            admin: req.session.admin,
            users
        })
    } catch (error) {
        console.error("Admin users error:", error)
        req.flash("error_msg", "Error loading users data")
        res.redirect("/admin/dashboard")
    }
})

// Edit user
router.get("/users/edit/:id", isAdmin, async (req, res) => {
    try {
        const [users] = await pool.query("SELECT * FROM users WHERE id = ?", [req.params.id])

        if (users.length === 0) {
            req.flash("error_msg", "User not found")
            return res.redirect("/admin/users")
        }

        res.render("admin/edit-user", {
            title: "Edit User - TradePro Admin",
            layout: "layouts/admin",
            admin: req.session.admin,
            user: users[0]
        })
    } catch (error) {
        console.error("Admin edit user error:", error)
        req.flash("error_msg", "Error loading user data")
        res.redirect("/admin/users")
    }
})

// Update user
router.post("/users/edit/:id", isAdmin, async (req, res) => {
    try {
        await pool.query(
            "UPDATE users SET username = ?, email = ?, balance = ? WHERE id = ?",
            [req.body.username, req.body.email, req.body.balance, req.params.id]
        )

        req.flash("success_msg", "User updated successfully")
        res.redirect("/admin/users")
    } catch (error) {
        console.error("Admin update user error:", error)
        req.flash("error_msg", "Error updating user")
        res.redirect(`/admin/users/edit/${req.params.id}`)
    }
})

// Delete user
router.post("/users/delete/:id", isAdmin, async (req, res) => {
    try {
        await pool.query("DELETE FROM users WHERE id = ?", [req.params.id])

        req.flash("success_msg", "User deleted successfully")
        res.redirect("/admin/users")
    } catch (error) {
        console.error("Admin delete user error:", error)
        req.flash("error_msg", "Error deleting user")
        res.redirect("/admin/users")
    }
})

// Manage Stocks
router.get("/stocks", isAdmin, async (req, res) => {
    try {
        const [stocks] = await pool.query("SELECT * FROM stocks ORDER BY name")

        res.render("admin/stocks", {
            title: "Manage Stocks - TradePro Admin",
            layout: "layouts/admin",
            admin: req.session.admin,
            stocks
        })
    } catch (error) {
        console.error("Admin stocks error:", error)
        req.flash("error_msg", "Error loading stocks data")
        res.redirect("/admin/dashboard")
    }
})

// Add stock form
router.get("/stocks/add", isAdmin, (req, res) => {
    res.render("admin/add-stock", {
        title: "Add Stock - TradePro Admin",
        layout: "layouts/admin",
        admin: req.session.admin
    })
})

// Add stock
router.post("/stocks/add", isAdmin, async (req, res) => {
    try {
        await pool.query(
            "INSERT INTO stocks (id, name, price, `change`, change_percent, volume, market_cap, sector) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                req.body.id.toUpperCase(),
                req.body.name,
                req.body.price,
                req.body.change,
                req.body.change_percent,
                req.body.volume,
                req.body.market_cap,
                req.body.sector
            ]
        )

        req.flash("success_msg", "Stock added successfully")
        res.redirect("/admin/stocks")
    } catch (error) {
        console.error("Admin add stock error:", error)
        req.flash("error_msg", "Error adding stock")
        res.redirect("/admin/stocks/add")
    }
})

// Edit stock
router.get("/stocks/edit/:id", isAdmin, async (req, res) => {
    try {
        const [stocks] = await pool.query("SELECT * FROM stocks WHERE id = ?", [req.params.id])

        if (stocks.length === 0) {
            req.flash("error_msg", "Stock not found")
            return res.redirect("/admin/stocks")
        }

        res.render("admin/edit-stock", {
            title: "Edit Stock - TradePro Admin",
            layout: "layouts/admin",
            admin: req.session.admin,
            stock: stocks[0]
        })
    } catch (error) {
        console.error("Admin edit stock error:", error)
        req.flash("error_msg", "Error loading stock data")
        res.redirect("/admin/stocks")
    }
})

// Update stock
router.post("/stocks/edit/:id", isAdmin, async (req, res) => {
    try {
        await pool.query(
            "UPDATE stocks SET name = ?, price = ?, `change` = ?, change_percent = ?, volume = ?, market_cap = ?, sector = ? WHERE id = ?",
            [
                req.body.name,
                req.body.price,
                req.body.change,
                req.body.change_percent,
                req.body.volume,
                req.body.market_cap,
                req.body.sector,
                req.params.id
            ]
        )

        req.flash("success_msg", "Stock updated successfully")
        res.redirect("/admin/stocks")
    } catch (error) {
        console.error("Admin update stock error:", error)
        req.flash("error_msg", "Error updating stock")
        res.redirect(`/admin/stocks/edit/${req.params.id}`)
    }
})

// Delete stock
router.post("/stocks/delete/:id", isAdmin, async (req, res) => {
    try {
        await pool.query("DELETE FROM stocks WHERE id = ?", [req.params.id])

        req.flash("success_msg", "Stock deleted successfully")
        res.redirect("/admin/stocks")
    } catch (error) {
        console.error("Admin delete stock error:", error)
        req.flash("error_msg", "Error deleting stock")
        res.redirect("/admin/stocks")
    }
})

// Admin logout
router.get("/logout", (req, res) => {
    delete req.session.admin
    req.flash("success_msg", "You are logged out")
    res.redirect("/admin/login")
})

module.exports = router 