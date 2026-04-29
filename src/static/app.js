document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const loginForm = document.getElementById("login-form");
  const logoutButton = document.getElementById("logout-btn");
  const authStatus = document.getElementById("auth-status");
  const messageDiv = document.getElementById("message");
  const emailInput = document.getElementById("email");

  const authState = {
    token: localStorage.getItem("authToken"),
    user: null,
  };

  function getAuthHeaders() {
    return authState.token
      ? { Authorization: `Bearer ${authState.token}` }
      : {};
  }

  function showMessage(message, type) {
    messageDiv.textContent = message;
    messageDiv.className = type;
    messageDiv.classList.remove("hidden");

    setTimeout(() => {
      messageDiv.classList.add("hidden");
    }, 5000);
  }

  function renderAuthState() {
    const role = authState.user?.role;
    const canSignup = ["student", "club_admin", "federation_admin"].includes(role);
    const canUnregister = ["club_admin", "federation_admin"].includes(role);

    if (authState.user) {
      authStatus.textContent = `Logged in as ${authState.user.username} (${authState.user.role})`;
      authStatus.className = "message info";
      logoutButton.classList.remove("hidden");
      loginForm.classList.add("hidden");
    } else {
      authStatus.textContent = "Not logged in. Sign in to perform protected actions.";
      authStatus.className = "message info";
      logoutButton.classList.add("hidden");
      loginForm.classList.remove("hidden");
    }

    signupForm.classList.toggle("hidden", !canSignup);
    if (!canSignup) {
      showMessage("Log in to sign up for an activity.", "info");
    }

    if (role === "student" && authState.user?.email) {
      emailInput.value = authState.user.email;
      emailInput.readOnly = true;
    } else {
      emailInput.readOnly = false;
    }

    // Refresh list so delete buttons reflect role permissions.
    fetchActivities(canUnregister);
  }

  async function fetchCurrentUser() {
    if (!authState.token) {
      authState.user = null;
      renderAuthState();
      return;
    }

    try {
      const response = await fetch("/auth/me", {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error("Session invalid");
      }

      authState.user = await response.json();
    } catch (error) {
      authState.token = null;
      authState.user = null;
      localStorage.removeItem("authToken");
    }

    renderAuthState();
  }

  // Function to fetch activities from API
  async function fetchActivities(canUnregister = false) {
    try {
      const response = await fetch("/activities");
      const activities = await response.json();

      // Clear loading message
      activitiesList.innerHTML = "";
      activitySelect.innerHTML = '<option value="">-- Select an activity --</option>';

      // Populate activities list
      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft =
          details.max_participants - details.participants.length;

        // Create participants HTML with delete icons instead of bullet points
        const participantsHTML =
          details.participants.length > 0
            ? `<div class="participants-section">
              <h5>Participants:</h5>
              <ul class="participants-list">
                ${details.participants
                  .map(
                    (email) =>
                      `<li><span class="participant-email">${email}</span>${
                        canUnregister
                          ? `<button class="delete-btn" data-activity="${name}" data-email="${email}">❌</button>`
                          : ""
                      }</li>`
                  )
                  .join("")}
              </ul>
            </div>`
            : `<p><em>No participants yet</em></p>`;

        activityCard.innerHTML = `
          <h4>${name}</h4>
          <p>${details.description}</p>
          <p><strong>Schedule:</strong> ${details.schedule}</p>
          <p><strong>Availability:</strong> ${spotsLeft} spots left</p>
          <div class="participants-container">
            ${participantsHTML}
          </div>
        `;

        activitiesList.appendChild(activityCard);

        // Add option to select dropdown
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });

      // Add event listeners to delete buttons
      document.querySelectorAll(".delete-btn").forEach((button) => {
        button.addEventListener("click", handleUnregister);
      });
    } catch (error) {
      activitiesList.innerHTML =
        "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  // Handle unregister functionality
  async function handleUnregister(event) {
    const button = event.target;
    const activity = button.getAttribute("data-activity");
    const email = button.getAttribute("data-email");

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/unregister?email=${encodeURIComponent(email)}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, "success");

        // Refresh activities list to show updated participants
        fetchActivities(["club_admin", "federation_admin"].includes(authState.user?.role));
      } else {
        showMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage("Failed to unregister. Please try again.", "error");
      console.error("Error unregistering:", error);
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();
      if (!response.ok) {
        showMessage(result.detail || "Login failed", "error");
        return;
      }

      authState.token = result.access_token;
      localStorage.setItem("authToken", authState.token);
      authState.user = {
        username: result.username,
        role: result.role,
        email: result.email,
      };

      loginForm.reset();
      showMessage("Login successful.", "success");
      renderAuthState();
    } catch (error) {
      showMessage("Login failed. Please try again.", "error");
      console.error("Error logging in:", error);
    }
  });

  logoutButton.addEventListener("click", async () => {
    try {
      const response = await fetch("/auth/logout", {
        method: "POST",
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const result = await response.json();
        showMessage(result.detail || "Logout failed", "error");
      }
    } catch (error) {
      console.error("Error logging out:", error);
    }

    authState.token = null;
    authState.user = null;
    localStorage.removeItem("authToken");
    showMessage("Logged out.", "success");
    renderAuthState();
  });

  // Handle form submission
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const activity = document.getElementById("activity").value;

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/signup?email=${encodeURIComponent(email)}`,
        {
          method: "POST",
          headers: getAuthHeaders(),
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, "success");
        signupForm.reset();
        if (authState.user?.role === "student" && authState.user?.email) {
          emailInput.value = authState.user.email;
        }

        // Refresh activities list to show updated participants
        fetchActivities(["club_admin", "federation_admin"].includes(authState.user?.role));
      } else {
        showMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage("Failed to sign up. Please try again.", "error");
      console.error("Error signing up:", error);
    }
  });

  // Initialize app
  fetchCurrentUser();
});
