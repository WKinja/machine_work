require("dotenv").config();
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { exec } = require("child_process");

const app = express();
const port = 5000; // Change to 3000 if needed
const secretKey = process.env.JWT_SECRET || "supersecret";

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Static pages
app.get("/", (req, res) => res.redirect("/login"));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/signup", (req, res) => res.sendFile(path.join(__dirname, "public", "signup.html")));

// MongoDB
const mongoURI = process.env.MONGO_URI || "your-mongo-uri";
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("✅ Connected to MongoDB");
    startServer();
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  });

// Symptom list (for frontend, optional)
const symptomList = [/* your full list here */];

function startServer() {
  // Mongoose models
  const userSchema = new mongoose.Schema({
    username: String,
    email: String,
    password: String,
    role: { type: String, enum: ["patient", "doctor", "admin"], required: true }
  });

  const diagnosisSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    symptoms: [String],
    disease: String,
    doctorComments: { type: String, default: "" }
  });

  const User = mongoose.model("User", userSchema);
  const Diagnosis = mongoose.model("Diagnosis", diagnosisSchema);

  // JWT/RBAC middleware
  const verifyToken = (roles = []) => {
    return async (req, res, next) => {
      const authHeader = req.headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Access Denied: No token provided." });
      }

      const token = authHeader.split(" ")[1];
      try {
        const decoded = jwt.verify(token, secretKey);
        const user = await User.findById(decoded.id);
        if (!user) return res.status(404).json({ message: "User not found." });
        if (roles.length && !roles.includes(user.role)) {
          return res.status(403).json({ message: "Forbidden: Role not allowed." });
        }

        req.user = decoded;
        req.userDetails = user;
        next();
      } catch (err) {
        console.error("❌ Token verification failed:", err.message);
        return res.status(401).json({ message: "Invalid token." });
      }
    };
  };

  // Dashboards
  app.get("/patient/index.html", verifyToken(["patient"]), (req, res) => {
    res.sendFile(path.join(__dirname, "public", "patient", "index.html"));
  });

  app.get("/doctor/index.html", verifyToken(["doctor"]), (req, res) => {
    res.sendFile(path.join(__dirname, "public", "doctor", "index.html"));
  });

  app.get("/admin/index.html", verifyToken(["admin"]), (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin", "index.html"));
  });

  app.get("/diagnosis", verifyToken(["patient"]), (req, res) => {
    res.sendFile(path.join(__dirname, "public", "diagnosis.html"));
  });

  app.get("/api/symptoms", (req, res) => {
    res.json({ symptoms: symptomList });
  });

  // Signup
  app.post("/signup", async (req, res) => {
    const { username, email, password, role } = req.body;
    try {
      const existingUser = await User.findOne({ email });
      if (existingUser) return res.status(400).json({ message: "User already exists." });

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = new User({ username, email, password: hashedPassword, role });
      await newUser.save();

      const token = jwt.sign({ id: newUser._id, role }, secretKey, { expiresIn: "1h" });
      const redirectTo = `/${role}/index.html`;
      res.status(201).json({ message: "Signup successful!", token, role, redirectTo });
    } catch (err) {
      res.status(500).json({ message: "Signup error." });
    }
  });

  // Login
  app.post("/auth", async (req, res) => {
    const { email, password } = req.body;
    try {
      const user = await User.findOne({ email });
      if (!user) return res.status(400).json({ message: "Invalid credentials." });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(400).json({ message: "Invalid credentials." });

      const token = jwt.sign({ id: user._id, role: user.role }, secretKey, { expiresIn: "1h" });
      const redirectTo = `/${user.role}/index.html`;
      res.json({ message: "Login successful!", token, role: user.role, redirectTo });
    } catch (err) {
      res.status(500).json({ message: "Login error." });
    }
  });

  // ✅ Prediction route
  app.post("/diagnose", verifyToken(["patient"]), async (req, res) => {
    const { symptoms } = req.body;
    if (!Array.isArray(symptoms) || symptoms.length === 0) {
      return res.status(400).json({ message: "Invalid symptoms." });
    }

    const symptomString = symptoms.join(",");
    exec(`python backend/predict.py "${symptomString}"`, async (err, stdout, stderr) => {
      if (err) {
        console.error("❌ Python error:", err.message);
        return res.status(500).json({ message: "Prediction failed." });
      }

      try {
        const diagnosis = stdout.trim();
        if (!diagnosis || diagnosis.length > 100) {
          throw new Error("Invalid prediction format");
        }

        const saved = await Diagnosis.create({
          userId: req.user.id,
          symptoms,
          disease: diagnosis
        });

        res.json({ diagnosis });
      } catch (parseErr) {
        console.error("❌ Prediction parse error:", parseErr.message);
        res.status(500).json({ message: "Prediction output error." });
      }
    });
  });

  // Doctor view
  app.get("/doctor/diagnoses", verifyToken(["doctor"]), async (req, res) => {
    try {
      const diagnoses = await Diagnosis.find().populate("userId", "username email");
      res.json(diagnoses);
    } catch (err) {
      res.status(500).json({ message: "Error fetching diagnoses." });
    }
  });

  app.post("/doctor/comment", verifyToken(["doctor"]), async (req, res) => {
    const { diagnosisId, comment } = req.body;
    try {
      const diagnosis = await Diagnosis.findById(diagnosisId);
      if (!diagnosis) return res.status(404).json({ message: "Diagnosis not found." });

      diagnosis.doctorComments = comment;
      await diagnosis.save();
      res.json({ message: "Comment added successfully." });
    } catch (err) {
      res.status(500).json({ message: "Error saving comment." });
    }
  });

  // Admin view
  app.get("/admin/users", verifyToken(["admin"]), async (req, res) => {
    try {
      const users = await User.find({}, "username email role");
      res.json(users);
    } catch (err) {
      res.status(500).json({ message: "Error fetching users." });
    }
  });
  // DELETE user by ID (admin only)
app.delete("/admin/users/:id", verifyToken(["admin"]), async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted successfully." });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete user." });
  }
});

// UPDATE user info (admin only)
app.put("/admin/users/:id", verifyToken(["admin"]), async (req, res) => {
  const { username, role } = req.body;
  try {
    await User.findByIdAndUpdate(req.params.id, { username, role });
    res.json({ message: "User updated successfully." });
  } catch (err) {
    res.status(500).json({ message: "Failed to update user." });
  }
});
app.get("/doctor/patients", verifyToken(["doctor"]), async (req, res) => {
  try {
    const patients = await User.find({ role: "patient" }, "username email role");
    res.json(patients);
  } catch (err) {
    res.status(500).json({ message: "Error fetching patients." });
  }
});



  // Start server
  app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
  });
}
