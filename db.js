const mysql = require("mysql2/promise")

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "trading_new",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
})

// Test the connection
pool.getConnection()
  .then(connection => {
    console.log('Database connection established successfully')
    connection.release()
  })
  .catch(err => {
    console.error('Database connection failed:', err)
    console.log('\nPlease make sure:')
    console.log('1. MySQL server is running')
    console.log('2. The database credentials are correct')
    console.log('3. The database "trading_new" exists')
    console.log('\nTo start MySQL server, run:')
    console.log('net start mysql')
    process.exit(1)
  })

module.exports = pool

