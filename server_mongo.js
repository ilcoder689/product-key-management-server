const express = require("express");
const { MongoClient } = require("mongodb");
const basicAuth = require("basic-auth");
const bodyParser = require("body-parser");
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static("public"));
const cors = require("cors");
app.use(cors());

// Set up MongoDB connection
const uri = process.env.MONGO_URI || "mongodb://localhost:27017";
const user = process.env.USERNAME || "admin";
const pass = process.env.PASSWORD || "admin";

const client = new MongoClient(uri);
let db;
let productKeysCollection;

client
  .connect()
  .then(() => {
    db = client.db("ases_pkms");
    productKeysCollection = db.collection("product_keys");
    console.log("Connected to MongoDB");
  })
  .catch((err) => console.error(err));

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

// Add product key
app.post("/product-keys", authenticate, async (req, res) => {
  const { key, maxActivations, expiryDays } = req.body;
  const expiryDate = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  try {
    const productKey = await productKeysCollection.findOne({ key });
    if (productKey) {
      res.status(400).json({ error: "Product key already exists" });
      return;
    }

    const result = await productKeysCollection.insertOne({
      key,
      maxActivations,
      expiryDate: expiryDate,
      activations: {},
    });
    if (result.acknowledged) {
      res.status(201).json({ message: "Product key added" });
    } else {
      res.status(201).json({ message: "Unknown status. Please refresh" });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed to add product key" });
  }
});

// Validate product key
app.post("/product-keys/validate", async (req, res) => {
  const { key, installationId } = req.body;

  try {
    const productKey = await productKeysCollection.findOne({ key });
    if (!productKey)
      return res.status(404).json({ error: "Product key not found" });

    if (productKey.expiryDate < new Date()) {
      return res.status(400).json({ error: "Product key expired" });
    }

    if (productKey.activations[installationId]) {
      return res.json({ valid: true, message: "Product key validated" });
    }

    if (
      Object.keys(productKey.activations).length >= productKey.maxActivations
    ) {
      return res.status(400).json({ error: "Maximum activations reached" });
    }

    productKey.activations[installationId] = new Date().toISOString();
    await productKeysCollection.updateOne(
      { key },
      { $set: { activations: productKey.activations } }
    );
    return res.json({ valid: true, message: "Product key validated" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to validate product key" });
  }
});

// Update product key
app.put("/product-keys/:key", authenticate, async (req, res) => {
  const { key } = req.params;
  const { maxActivations, expiryDays } = req.body;

  try {
    const productKey = await productKeysCollection.findOne({ key });
    if (!productKey)
      return res.status(404).json({ error: "Product key not found" });

    const updates = {};
    if (maxActivations) updates.maxActivations = maxActivations;
    if (expiryDays) {
      const expiryDate = new Date(
        Date.now() + expiryDays * 24 * 60 * 60 * 1000
      );
      updates.expiryDate = expiryDate;
    }

    await productKeysCollection.updateOne({ key }, { $set: updates });
    res.json({ message: "Product key updated" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update product key" });
  }
});

// Delete product key
app.delete("/product-keys/:key", authenticate, async (req, res) => {
  const { key } = req.params;

  try {
    await productKeysCollection.deleteOne({ key });
    res.json({ message: "Product key deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete product key" });
  }
});

// List product keys
app.get("/product-keys", authenticate, async (req, res) => {
  try {
    const productKeys = await productKeysCollection.find().toArray();
    for (key in productKeys) {
      key = productKeys[key];

      activationDate = key.activations ? Object.keys(key.activations) : [];
      activationDate =
        activationDate.length > 0
          ? new Date(Date.parse(key.activations[activationDate[0]]))
              .toISOString()
              .replace("T", " ")
              .replace("Z", "")
          : "NULL";
      expiryDate =
        activationDate == "NULL"
          ? "NULL"
          : new Date(
              Date.parse(activationDate + "Z") + 365 * 24 * 60 * 60 * 1000
            )
              .toISOString()
              .replace("T", " ")
              .replace("Z", "");
      console.log(
        `INSERT INTO product_keys (product_key, max_activations, validity, activation_date, expiry_date, activations, users) VALUES ('${
          key.key
        }',${
          key.maxActivations
        },365,'${activationDate}','${expiryDate}','${JSON.stringify(
          key.activations
        )}','${JSON.stringify([])}');`
      );
    }
    res.json(productKeys);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch product keys" });
  }
});

// Delete specific activation
app.delete(
  "/product-keys/:key/activations/:installationId",
  authenticate,
  async (req, res) => {
    const { key, installationId } = req.params;

    try {
      const productKey = await productKeysCollection.findOne({ key });
      if (!productKey)
        return res.status(404).json({ error: "Product key not found" });

      if (!productKey.activations[installationId]) {
        return res.status(404).json({ error: "Activation not found" });
      }

      delete productKey.activations[installationId];
      await productKeysCollection.updateOne(
        { key },
        { $set: { activations: productKey.activations } }
      );

      res.json({ message: "Activation deleted" });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete activation" });
    }
  }
);

const port = process.env.PORT || 3005;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
