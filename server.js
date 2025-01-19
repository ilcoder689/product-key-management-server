const express = require("express");
const mysql = require("mysql2/promise");
const basicAuth = require("basic-auth");
const bodyParser = require("body-parser");
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static("public"));
const cors = require("cors");
app.use(cors());

const MAX_USERS_PER_PRODUCT_KEY = 1;

// MySQL Configuration
const mysqlConfig = {
  host: process.env.MYSQL_HOST || "localhost",
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DB || "ases_pkms",
  timezone: "Z",
};
const user = process.env.USER || "admin";
const pass = process.env.PASSWORD || "admin";

let db;

// Initialize MySQL Connection
const initializeDatabase = async () => {
  db = await mysql.createPool(mysqlConfig);
  console.log("Connected to MySQL");
  // await db.query(`
  // CREATE TABLE IF NOT EXISTS product_keys (
  //   product_key VARCHAR(255) PRIMARY KEY,
  //   max_activations INT NOT NULL,
  //   start_date DATETIME NOT NULL,
  //   expiry_date DATETIME NOT NULL,
  //   activation_date DATETIME,
  //   activations LONGTEXT NOT NULL,
  //   users LONGTEXT NOT NULL,
  //   created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  //   updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  //  )
  //   );
  // `);
};

initializeDatabase().catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});

// HTTP Basic Authentication middleware
const authenticate = (req, res, next) => {
  const credentials = basicAuth(req);
  if (credentials && credentials.name === user && credentials.pass === pass) {
    next();
  } else {
    res.set("WWW-Authenticate", 'Basic realm="Authorization Required"');
    res.status(401).json({ error: "Unauthorized" });
  }
};

// Utility functions for MySQL operations
const dbOperations = {
  async addProductKey(key, maxActivations, startDate, expiryDate) {
    const [rows] = await db.query(
      "SELECT * FROM product_keys WHERE product_key = ?",
      [key]
    );
    if (rows.length > 0) throw new Error("Product key already exists");

    await db.query(
      "INSERT INTO product_keys (product_key, max_activations, start_date, expiry_date, activations, users) VALUES (?, ?, ?, ?, ?, ?)",
      [
        key,
        maxActivations,
        startDate,
        expiryDate,
        JSON.stringify({}),
        JSON.stringify([]),
      ]
    );
  },
  async fetchProductKey(key) {
    const [rows] = await db.query(
      "SELECT * FROM product_keys WHERE product_key = ?",
      [key]
    );
    if (rows.length === 0) throw new Error("Product key not found");
    const productKey = rows[0];
    productKey.activations = JSON.parse(productKey.activations);
    productKey.users = JSON.parse(productKey.users);
    return productKey;
  },
  async updateProductKey(key, updates) {
    const updateQuery = Object.keys(updates)
      .map((field) => `${field} = ?`)
      .join(", ");
    const updateValues = Object.values(updates);
    updateValues.push(key);

    await db.query(
      `UPDATE product_keys SET ${updateQuery} WHERE product_key = ?`,
      updateValues
    );
  },
  async deleteProductKey(key) {
    await db.query("DELETE FROM product_keys WHERE product_key = ?", [key]);
  },
  async listProductKeys() {
    const [rows] = await db.query("SELECT * FROM product_keys");
    return rows.map((row) => ({
      ...row,
      activations: JSON.parse(row.activations),
      users: JSON.parse(row.users),
    }));
  },
  async listUserProductKey(productKey, userId) {
    const [rows] = await db.query(
      "SELECT * FROM product_keys where start_date <= current_timestamp and expiry_date >= current_timestamp and product_key like ? and users like ? order by expiry_date desc",
      [`%${productKey}%`, `%${userId}%`]
    );
    if (rows.length == 0) throw new Error("Active Product key not found");
    return rows[0];
  },
};

// Add product key
app.post("/product-keys", authenticate, async (req, res) => {
  let { key, maxActivations, startDate, expiryDate } = req.body;

  try {
    if (new Date(startDate) > new Date(expiryDate)) {
      throw new Error("Start date must be less than expiry date");
    }

    // Store as UTC date in DB
    startDate = new Date(startDate)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");

    // Store as UTC date in DB
    expiryDate = new Date(expiryDate)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");

    await dbOperations.addProductKey(
      key,
      maxActivations,
      startDate,
      expiryDate
    );
    res.status(201).json({ message: "Product key added" });
  } catch (err) {
    res.status(400).json({ error: true, message: err.message });
  }
});

// Add user to product key
app.post("/product-keys/:key/users", authenticate, async (req, res) => {
  const { key } = req.params;
  const { userId } = req.body;

  try {
    const productKey = await dbOperations.fetchProductKey(key);
    if (!productKey.users.includes(userId)) {
      productKey.users.push(userId);
    }
    await dbOperations.updateProductKey(key, {
      users: JSON.stringify(productKey.users),
    });
    res.json({ message: "User added to product key" });
  } catch (err) {
    res.status(400).json({ error: true, message: err.message });
  }
});

// Validate product key
app.post("/product-keys/validate", async (req, res) => {
  const { key, installationId, userId } = req.body;

  try {
    const productKey = await dbOperations.fetchProductKey(key);

    if (new Date(productKey.expiry_date) < new Date())
      throw new Error("Product key expired");

    if (new Date(productKey.start_date) > new Date())
      throw new Error("Product key not yet active");

    if (!productKey.activations[installationId]) {
      if (
        Object.keys(productKey.activations).length >= productKey.max_activations
      ) {
        throw new Error("Maximum activations reached");
      } else {
        productKey.activations[installationId] = new Date().toISOString();
      }
    }

    if (userId && !productKey.users.includes(userId)) {
      if (productKey.users.length >= MAX_USERS_PER_PRODUCT_KEY) {
        throw new Error("Maximum users linked to product key.");
      } else {
        productKey.users.push(userId);
      }
    }

    if (Object.keys(productKey.activations).length == 1) {
      productKey.activation_date = productKey.activations[installationId]
        .replace("T", " ")
        .replace("Z", "");
    }

    await dbOperations.updateProductKey(key, {
      activation_date: productKey.activation_date,
      activations: JSON.stringify(productKey.activations),
      users: JSON.stringify(productKey.users),
    });

    res.json({ valid: true, message: "Product key validated" });
  } catch (err) {
    res.status(400).json({ valid: false, error: true, message: err.message });
  }
});

// Validate product key with user
app.post("/product-keys/validate/user", async (req, res) => {
  let { key, userId } = req.body;
  if (!key) {
    key = "";
  }
  console.log(key, userId);

  try {
    const productKey = await dbOperations.listUserProductKey(key, userId);
    console.log(productKey);
    return res.status(200).json({ valid: true, ...productKey });
  } catch (err) {
    res.status(400).json({ error: true, message: err.message });
  }
});

// Update product key
app.put("/product-keys/:key", authenticate, async (req, res) => {
  const { key } = req.params;
  const { maxActivations, startDate, expiryDate, users } = req.body;

  try {
    const productKey = await dbOperations.fetchProductKey(key);

    const updates = {};
    if (maxActivations) updates.max_activations = maxActivations;
    if (startDate)
      updates.start_date = new Date(startDate)
        .toISOString()
        .replace("T", " ")
        .replace("Z", "");
    if (users) updates.users = users;
    if (expiryDate)
      updates.expiry_date = new Date(expiryDate)
        .toISOString()
        .replace("T", " ")
        .replace("Z", "");

    if (startDate && expiryDate && new Date(startDate) > new Date(expiryDate)) {
      throw new Error("Start date must be less than expiry date");
    }

    await dbOperations.updateProductKey(key, updates);
    res.json({ message: "Product key updated" });
  } catch (err) {
    res.status(400).json({ error: true, message: err.message });
  }
});

// Delete product key
app.delete("/product-keys/:key", authenticate, async (req, res) => {
  const { key } = req.params;

  try {
    await dbOperations.fetchProductKey(key);
    await dbOperations.deleteProductKey(key);
    res.json({ message: "Product key deleted" });
  } catch (err) {
    res.status(500).json({
      error: true,
      message: "Failed to delete product key",
      reason: err.message,
    });
  }
});

// List product keys
app.get("/product-keys", authenticate, async (req, res) => {
  try {
    const productKeys = await dbOperations.listProductKeys();
    res.json(productKeys);
  } catch (err) {
    res.status(500).json({
      error: true,
      message: "Failed to fetch product keys",
      reason: err.message,
    });
  }
});

// Delete specific activation
app.delete(
  "/product-keys/:key/activations/:installationId",
  authenticate,
  async (req, res) => {
    const { key, installationId } = req.params;

    try {
      const productKey = await dbOperations.fetchProductKey(key);
      if (!productKey)
        return res.status(404).json({ error: "Product key not found" });

      if (!productKey.activations[installationId]) {
        return res.status(404).json({ error: "Activation not found" });
      }

      delete productKey.activations[installationId];
      await dbOperations.updateProductKey(key, {
        activations: JSON.stringify(productKey.activations),
      });

      res.json({ message: "Activation deleted" });
    } catch (err) {
      res.status(500).json({
        error: true,
        message: "Failed to delete activation",
        reason: err.message,
      });
    }
  }
);

// Delete specific user
app.delete(
  "/product-keys/:key/users/:userId",
  authenticate,
  async (req, res) => {
    const { key, userId } = req.params;

    try {
      const productKey = await dbOperations.fetchProductKey(key);
      if (!productKey)
        return res.status(404).json({ error: "Product key not found" });

      if (!productKey.users.includes(userId)) {
        return res.status(404).json({ error: "User not found" });
      }

      productKey.users = productKey.users.filter((user) => user != userId);
      await dbOperations.updateProductKey(key, {
        users: JSON.stringify(productKey.users),
      });

      res.json({ message: "Activation deleted" });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: true,
        message: "Failed to delete activation",
        reason: err.message,
      });
    }
  }
);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
