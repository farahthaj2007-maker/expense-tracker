require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
    console.error("Please configure your .env file.");
    process.exit(1);
}

// USER MODEL
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    }
});

const User = mongoose.model("User", userSchema);

// EXPENSE MODEL
const expenseSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0.01
    },
    category: {
        type: String,
        required: true
    },
    date: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

const Expense = mongoose.model("Expense", expenseSchema);

// AUTHENTICATION
function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "Please log in again."
        });
    }

    try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.userId = decoded.userId;

        next();
    } catch (error) {
        return res.status(401).json({
            message: "Session expired. Please log in again."
        });
    }
}

// REGISTER
app.post("/api/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string" ||
            !name.trim() ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                message: "Complete all registration fields."
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must contain at least 6 characters."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const existingUser = await User.findOne({
            email: normalizedEmail
        });

        if (existingUser) {
            return res.status(409).json({
                message: "Email already registered. Please log in."
            });
        }

        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password: await bcrypt.hash(password, 10)
        });

        const token = jwt.sign(
            { userId: user._id.toString() },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.status(201).json({
            message: "Registration successful!",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error("Registration error:", error.message);

        res.status(500).json({
            message: "Registration failed."
        });
    }
});

// LOGIN
app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (
            typeof email !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                message: "Enter your email and password."
            });
        }

        const user = await User.findOne({
            email: email.trim().toLowerCase()
        });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const token = jwt.sign(
            { userId: user._id.toString() },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            message: "Login successful!",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error("Login error:", error.message);

        res.status(500).json({
            message: "Login failed."
        });
    }
});

// GET ALL EXPENSES FOR THE LOGGED-IN USER
app.get("/api/expenses", authenticateToken, async (req, res) => {
    try {
        const expenses = await Expense.find({
            userId: req.userId
        }).sort({
            date: -1,
            createdAt: -1
        });

        res.json(expenses);
    } catch (error) {
        res.status(500).json({
            message: "Could not load expenses."
        });
    }
});

// ADD EXPENSE
app.post("/api/expenses", authenticateToken, async (req, res) => {
    try {
        const { title, amount, category, date } = req.body;

        if (
            typeof title !== "string" ||
            !title.trim() ||
            typeof category !== "string" ||
            !category.trim() ||
            typeof date !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !Number.isFinite(Number(amount)) ||
            Number(amount) <= 0
        ) {
            return res.status(400).json({
                message: "Enter valid expense details."
            });
        }

        const expense = await Expense.create({
            userId: req.userId,
            title: title.trim(),
            amount: Number(amount),
            category: category.trim(),
            date
        });

        res.status(201).json({
            message: "Expense added successfully!",
            expense
        });
    } catch (error) {
        console.error("Add expense error:", error.message);

        res.status(500).json({
            message: "Could not save the expense."
        });
    }
});

// UPDATE EXPENSE
app.put("/api/expenses/:id", authenticateToken, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                message: "Invalid expense ID."
            });
        }

        const { title, amount, category, date } = req.body;

        if (
            typeof title !== "string" ||
            !title.trim() ||
            typeof category !== "string" ||
            !category.trim() ||
            typeof date !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !Number.isFinite(Number(amount)) ||
            Number(amount) <= 0
        ) {
            return res.status(400).json({
                message: "Enter valid expense details."
            });
        }

        const expense = await Expense.findOneAndUpdate(
            {
                _id: req.params.id,
                userId: req.userId
            },
            {
                title: title.trim(),
                amount: Number(amount),
                category: category.trim(),
                date
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!expense) {
            return res.status(404).json({
                message: "Expense not found."
            });
        }

        res.json({
            message: "Expense updated successfully!",
            expense
        });
    } catch (error) {
        console.error("Update expense error:", error.message);

        res.status(500).json({
            message: "Could not update expense."
        });
    }
});

// DELETE EXPENSE
app.delete("/api/expenses/:id", authenticateToken, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                message: "Invalid expense ID."
            });
        }

        const expense = await Expense.findOneAndDelete({
            _id: req.params.id,
            userId: req.userId
        });

        if (!expense) {
            return res.status(404).json({
                message: "Expense not found."
            });
        }

        res.json({
            message: "Expense deleted successfully!"
        });
    } catch (error) {
        res.status(500).json({
            message: "Could not delete expense."
        });
    }
});

// MONTHLY SUMMARY
app.get("/api/summary/monthly", authenticateToken, async (req, res) => {
    try {
        const summary = await Expense.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(req.userId)
                }
            },
            {
                $group: {
                    _id: {
                        year: { $substrBytes: ["$date", 0, 4] },
                        month: { $substrBytes: ["$date", 5, 2] }
                    },
                    total: { $sum: "$amount" },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: {
                    "_id.year": -1,
                    "_id.month": -1
                }
            }
        ]);

        res.json(summary);
    } catch (error) {
        console.error("Summary error:", error.message);

        res.status(500).json({
            message: "Could not load monthly summary."
        });
    }
});

// UPDATE PROFILE
app.put("/api/profile", authenticateToken, async (req, res) => {
    try {
        const { name, email } = req.body;

        if (
            typeof name !== "string" ||
            !name.trim() ||
            typeof email !== "string" ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        ) {
            return res.status(400).json({
                message: "Enter a valid name and email."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const existingUser = await User.findOne({
            email: normalizedEmail,
            _id: { $ne: req.userId }
        });

        if (existingUser) {
            return res.status(409).json({
                message: "This email is already being used."
            });
        }

        const user = await User.findByIdAndUpdate(
            req.userId,
            {
                name: name.trim(),
                email: normalizedEmail
            },
            {
                new: true,
                runValidators: true
            }
        ).select("-password");

        if (!user) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        res.json({
            message: "Profile updated successfully!",
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error("Profile update error:", error.message);

        res.status(500).json({
            message: "Could not update profile."
        });
    }
});

// START SERVER
async function startServer() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        console.log("MongoDB connected successfully!");

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Expense Tracker running on port ${PORT}`);
        });
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        process.exit(1);
    }
}

startServer();