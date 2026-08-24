const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  loginMessage.textContent = "";
  loginMessage.className = "message";

  loginButton.disabled = true;
  loginButton.textContent = "Signing in...";

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.error || "Unable to sign in"
      );
    }

    sessionStorage.setItem(
      "bootbros_token",
      data.token
    );

    sessionStorage.setItem(
      "bootbros_user",
      JSON.stringify(data.user)
    );

    sessionStorage.setItem(
      "bootbros_organization",
      JSON.stringify(data.organization)
    );

    loginMessage.textContent = "Login successful.";
    loginMessage.className = "message success";

    window.location.href = "/dashboard.html";

  } catch (error) {
    console.error("Login error:", error);

    loginMessage.textContent =
      error.message || "Unable to sign in.";

    loginMessage.className = "message error";

    loginButton.disabled = false;
    loginButton.textContent = "Sign In";
  }
});
