USE trading_new;

-- Admin table
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin (password: admin123)
INSERT INTO admins (username, email, password) 
VALUES ('admin', 'admin@tradepro.com', '$2b$10$3euPgdDO5G9ggIB7RSQoMe1HmG35DXwkEGkmxHmG9lVRlcyNkm7e.'); 