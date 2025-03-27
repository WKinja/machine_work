const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// 🔹 Patient Dashboard
router.get('/patient', authMiddleware, (req, res) => {
    if (req.user.role !== 'patient') return res.status(403).json({ message: "Access Denied" });
    res.json({ message: "Welcome to the Patient Dashboard" });
});

// 🔹 Doctor Dashboard
router.get('/doctor', authMiddleware, (req, res) => {
    if (req.user.role !== 'doctor') return res.status(403).json({ message: "Access Denied" });
    res.json({ message: "Welcome to the Doctor Dashboard" });
});

// 🔹 Admin Dashboard
router.get('/admin', authMiddleware, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Access Denied" });
    res.json({ message: "Welcome to the Admin Dashboard" });
});

module.exports = router;
