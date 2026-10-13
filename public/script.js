const $ = (id) => document.getElementById(id);

let token = localStorage.getItem("expenseToken") || "";
let currentUser = null;
let expenses = [];
let editingExpenseId = null;

function showMessage(id, message, isError = false) {
    const element = $(id);

    if (!element) return;

    element.textContent = message;
    element.style.color = isError ? "#dc2626" : "#15803d";
}

function localDate() {
    const now = new Date();

    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
    ].join("-");
}

function formatCurrency(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2
    }).format(Number(amount) || 0);
}

// API HELPER
async function api(url, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    let response;

    try {
        response = await fetch(url, {
            ...options,
            headers
        });
    } catch {
        throw new Error(
            "Cannot contact the server. Make sure npm.cmd start is running."
        );
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.message || `Request failed (${response.status}).`
        );
    }

    return data;
}

// LOGIN AND REGISTRATION FORMS
function showAuthForm(mode) {
    $("loginForm").classList.toggle("hidden", mode !== "login");
    $("registerForm").classList.toggle("hidden", mode !== "register");

    $("loginTab").classList.toggle("active", mode === "login");
    $("registerTab").classList.toggle("active", mode === "register");

    showMessage("loginMessage", "");
    showMessage("registerMessage", "");
}

// DASHBOARD
function showDashboard() {
    $("authSection").classList.add("hidden");
    $("dashboard").classList.remove("hidden");

    $("userName").textContent = currentUser?.name || "User";
    $("userEmail").textContent = currentUser?.email || "";

    $("profileName").value = currentUser?.name || "";
    $("profileEmail").value = currentUser?.email || "";
}

function saveSession(data) {
    token = data.token;
    currentUser = data.user;

    localStorage.setItem("expenseToken", token);
    localStorage.setItem("expenseUser", JSON.stringify(currentUser));

    showDashboard();
}

function logout(showLogin = true) {
    token = "";
    currentUser = null;
    expenses = [];
    editingExpenseId = null;

    localStorage.removeItem("expenseToken");
    localStorage.removeItem("expenseUser");

    $("dashboard").classList.add("hidden");

    if (showLogin) {
        $("authSection").classList.remove("hidden");
        showAuthForm("login");
    }
}

// LOGIN
$("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = $("loginForm").querySelector('button[type="submit"]');
    button.disabled = true;

    showMessage("loginMessage", "Logging in...");

    try {
        const data = await api("/api/login", {
            method: "POST",
            body: JSON.stringify({
                email: $("loginEmail").value.trim(),
                password: $("loginPassword").value
            })
        });

        saveSession(data);

        $("loginForm").reset();

        await loadExpenses();
        await loadMonthlySummary();

        showMessage("expenseMessage", "Login successful!");
    } catch (error) {
        showMessage("loginMessage", error.message, true);
    } finally {
        button.disabled = false;
    }
});

// REGISTER
$("registerForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = $("registerForm").querySelector('button[type="submit"]');
    button.disabled = true;

    showMessage("registerMessage", "Creating account...");

    try {
        const data = await api("/api/register", {
            method: "POST",
            body: JSON.stringify({
                name: $("registerName").value.trim(),
                email: $("registerEmail").value.trim(),
                password: $("registerPassword").value
            })
        });

        saveSession(data);

        $("registerForm").reset();

        await loadExpenses();
        await loadMonthlySummary();

        showMessage("expenseMessage", "Account created successfully!");
    } catch (error) {
        showMessage("registerMessage", error.message, true);
    } finally {
        button.disabled = false;
    }
});

$("loginTab").addEventListener("click", () => showAuthForm("login"));
$("registerTab").addEventListener("click", () => showAuthForm("register"));

// VALIDATE EXPENSE
function validateExpense(payload) {
    if (!payload.title) {
        throw new Error("Please enter an expense name.");
    }

    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
        throw new Error("Enter an amount greater than zero.");
    }

    if (!payload.category || !payload.date) {
        throw new Error("Please complete every field.");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
        throw new Error("Please select a valid date.");
    }

    if (
        $("filterFromDate").value &&
        $("filterToDate").value &&
        $("filterFromDate").value > $("filterToDate").value
    ) {
        // This condition does not invalidate an expense.
        // Date filter validation is handled separately.
    }
}

// ADD OR UPDATE EXPENSE
$("expenseForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = $("addExpenseButton");
    button.disabled = true;

    try {
        const payload = {
            title: $("title").value.trim(),
            amount: Number($("amount").value),
            category: $("category").value,
            date: $("date").value
        };

        validateExpense(payload);

        if (editingExpenseId) {
            await api(`/api/expenses/${encodeURIComponent(editingExpenseId)}`, {
                method: "PUT",
                body: JSON.stringify(payload)
            });

            editingExpenseId = null;

            showMessage("expenseMessage", "Expense updated successfully!");
        } else {
            await api("/api/expenses", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            showMessage("expenseMessage", "Expense added successfully!");
        }

        $("expenseForm").reset();
        $("date").value = localDate();
        button.textContent = "Add Expense";

        await loadExpenses();
        await loadMonthlySummary();
    } catch (error) {
        showMessage("expenseMessage", error.message, true);
    } finally {
        button.disabled = false;
    }
});

// LOAD EXPENSES
async function loadExpenses() {
    try {
        const data = await api("/api/expenses");

        if (!Array.isArray(data)) {
            throw new Error("Unexpected response from server.");
        }

        expenses = data;
        renderExpenses();
    } catch (error) {
        showMessage("expenseMessage", error.message, true);
    }
}

// SEARCH AND FILTER
function getFilteredExpenses() {
    const search = $("searchExpense").value.trim().toLowerCase();
    const category = $("filterCategory").value;
    const fromDate = $("filterFromDate").value;
    const toDate = $("filterToDate").value;

    return expenses.filter((expense) => {
        return (
            expense.title.toLowerCase().includes(search) &&
            (!category || expense.category === category) &&
            (!fromDate || expense.date >= fromDate) &&
            (!toDate || expense.date <= toDate)
        );
    });
}

// DISPLAY EXPENSES
function renderExpenses() {
    const list = $("expenseList");
    list.replaceChildren();

    const total = expenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0),
        0
    );

    $("totalAmount").textContent = formatCurrency(total);
    $("expenseCount").textContent = String(expenses.length);

    const filtered = getFilteredExpenses();

    $("emptyMessage").textContent = expenses.length === 0
        ? "No expenses added yet."
        : "No expenses match your search or filters.";

    $("emptyMessage").classList.toggle("hidden", filtered.length > 0);
    $("expenseTable").classList.toggle("hidden", filtered.length === 0);

    filtered.forEach((expense) => {
        const row = document.createElement("tr");

        const title = document.createElement("td");
        title.textContent = expense.title;

        const category = document.createElement("td");
        category.textContent = expense.category;

        const date = document.createElement("td");
        date.textContent = expense.date;

        const amount = document.createElement("td");
        amount.textContent = formatCurrency(expense.amount);

        const actions = document.createElement("td");
        const buttons = document.createElement("div");
        buttons.className = "action-buttons";

        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "edit-btn";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => startEditingExpense(expense));

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "delete-btn";
        remove.textContent = "Delete";
        remove.addEventListener("click", () => deleteExpense(expense._id, remove));

        buttons.append(edit, remove);
        actions.appendChild(buttons);

        row.append(title, category, date, amount, actions);
        list.appendChild(row);
    });
}

// EDIT EXPENSE
function startEditingExpense(expense) {
    editingExpenseId = expense._id;

    $("title").value = expense.title;
    $("amount").value = expense.amount;
    $("category").value = expense.category;
    $("date").value = expense.date;

    $("addExpenseButton").textContent = "Update Expense";

    showMessage("expenseMessage", "Edit the details and click Update Expense.");

    $("expenseForm").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

// DELETE EXPENSE
async function deleteExpense(id, button) {
    if (!confirm("Are you sure you want to delete this expense?")) {
        return;
    }

    button.disabled = true;

    try {
        await api(`/api/expenses/${encodeURIComponent(id)}`, {
            method: "DELETE"
        });

        await loadExpenses();
        await loadMonthlySummary();

        showMessage("expenseMessage", "Expense deleted successfully!");
    } catch (error) {
        showMessage("expenseMessage", error.message, true);
    } finally {
        button.disabled = false;
    }
}

// FILTER EVENTS
["searchExpense", "filterCategory", "filterFromDate", "filterToDate"]
    .forEach((id) => {
        $(id).addEventListener("input", renderExpenses);
        $(id).addEventListener("change", renderExpenses);
    });

$("clearFilters").addEventListener("click", () => {
    $("searchExpense").value = "";
    $("filterCategory").value = "";
    $("filterFromDate").value = "";
    $("filterToDate").value = "";

    renderExpenses();
});

// MONTHLY SUMMARY
async function loadMonthlySummary() {
    const container = $("monthlySummary");
    container.replaceChildren();

    try {
        const summary = await api("/api/summary/monthly");

        if (!summary.length) {
            container.textContent = "No monthly expense data available yet.";
            return;
        }

        summary.forEach((item) => {
            const year = Number(item._id.year);
            const month = Number(item._id.month);

            const monthName = new Date(year, month - 1, 1)
                .toLocaleDateString("en-IN", {
                    month: "long",
                    year: "numeric"
                });

            const card = document.createElement("div");
            card.className = "month-summary";

            const label = document.createElement("p");
            label.textContent = monthName;

            const total = document.createElement("strong");
            total.textContent = formatCurrency(item.total);

            const count = document.createElement("span");
            count.textContent = `${item.count} expense(s)`;

            card.append(label, total, count);
            container.appendChild(card);
        });
    } catch (error) {
        container.textContent = error.message;
    }
}

// PROFILE MANAGEMENT
$("profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = $("profileForm").querySelector('button[type="submit"]');
    button.disabled = true;

    try {
        const data = await api("/api/profile", {
            method: "PUT",
            body: JSON.stringify({
                name: $("profileName").value.trim(),
                email: $("profileEmail").value.trim()
            })
        });

        currentUser = data.user;

        localStorage.setItem("expenseUser", JSON.stringify(currentUser));

        showDashboard();

        showMessage("profileMessage", "Profile updated successfully!");
    } catch (error) {
        showMessage("profileMessage", error.message, true);
    } finally {
        button.disabled = false;
    }
});

// LOGOUT
$("logoutButton").addEventListener("click", () => logout(true));

// RESTORE LOGIN
async function restoreSession() {
    $("date").value = localDate();

    const savedUser = localStorage.getItem("expenseUser");

    if (!token || !savedUser) {
        logout(true);
        return;
    }

    try {
        currentUser = JSON.parse(savedUser);

        if (!currentUser?.email) {
            logout(true);
            return;
        }

        showDashboard();

        await loadExpenses();
        await loadMonthlySummary();
    } catch {
        logout(true);
    }
}

restoreSession();