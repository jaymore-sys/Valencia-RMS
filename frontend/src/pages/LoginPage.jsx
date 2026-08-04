import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, LogIn, Mail } from "lucide-react";
import api from "../api/axios";

const LoginPage = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const getRedirectPath = (roleName) => {
    const role = String(roleName || "").toLowerCase().trim();

    if (role === "superadmin") return "/superadmin/overview";
    if (role === "administrator") return "/administrator/overview";
    if (role === "admin") return "/admin/overview";
    if (role === "employee") return "/employee/overview";

    return "/login";
  };

  const handleLogin = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      setMessage("");

      const response = await api.post("/auth/login", {
        email: form.email.trim(),
        password: form.password,
      });

      const token = response.data?.token;
      const user = response.data?.user;

      if (!token || !user) {
        setMessage("Login failed.");
        return;
      }

      sessionStorage.setItem("token", token);
      sessionStorage.setItem("user", JSON.stringify(user));

      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));

      navigate(getRedirectPath(user.role_name), { replace: true });
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Login failed."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={handleLogin}>
        <div style={styles.logoBox}>V</div>

        <h1 style={styles.title}>Valencia RMS</h1>

        <p style={styles.subtitle}>
          Login to access your role-based dashboard.
        </p>

        {message && <div style={styles.errorBox}>{message}</div>}

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Email</label>

          <div style={styles.inputWrap}>
            <Mail size={18} color="#667085" />

            <input
              style={styles.input}
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="Enter your email"
              autoComplete="email"
              required
            />
          </div>
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Password</label>

          <div style={styles.inputWrap}>
            <Lock size={18} color="#667085" />

            <input
              style={{
                ...styles.input,
                paddingRight: "40px",
              }}
              type={showPassword ? "text" : "password"}
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />

            <button
              type="button"
              style={styles.eyeButton}
              onClick={() => setShowPassword((previous) => !previous)}
              title={showPassword ? "Hide password" : "Show password"}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff size={19} color="#667085" />
              ) : (
                <Eye size={19} color="#667085" />
              )}
            </button>
          </div>
        </div>

        <button type="submit" style={styles.loginButton} disabled={loading}>
          <LogIn size={20} />
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
};

const styles = {
  page: {
    minHeight: "100vh",
    width: "100%",
    background: "#f5f7fb",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "18px",
    boxSizing: "border-box",
  },
  card: {
    width: "min(440px, 92vw)",
    background: "#ffffff",
    borderRadius: "24px",
    padding: "30px 34px",
    boxShadow: "0 22px 54px rgba(15, 23, 42, 0.08)",
    border: "1px solid #eeeeee",
    boxSizing: "border-box",
  },
  logoBox: {
    width: "58px",
    height: "58px",
    borderRadius: "17px",
    background: "#ff5733",
    color: "#ffffff",
    display: "grid",
    placeItems: "center",
    fontSize: "32px",
    fontWeight: 900,
    margin: "0 auto 20px",
  },
  title: {
    margin: "0 0 8px",
    textAlign: "center",
    color: "#000000",
    fontSize: "30px",
    fontWeight: 900,
    letterSpacing: "-0.04em",
  },
  subtitle: {
    margin: "0 0 26px",
    textAlign: "center",
    color: "#667085",
    fontSize: "15px",
    fontWeight: 500,
  },
  errorBox: {
    background: "#fff1f2",
    border: "1px solid #fecdd3",
    color: "#b42318",
    borderRadius: "14px",
    padding: "12px 15px",
    fontSize: "14px",
    fontWeight: 900,
    marginBottom: "18px",
  },
  fieldGroup: {
    marginBottom: "18px",
  },
  label: {
    display: "block",
    color: "#111827",
    fontSize: "14px",
    fontWeight: 900,
    marginBottom: "8px",
  },
  inputWrap: {
    position: "relative",
    height: "52px",
    border: "1px solid #e5e7eb",
    borderRadius: "16px",
    background: "#ffffff",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "0 14px",
    boxSizing: "border-box",
  },
  input: {
    width: "100%",
    height: "100%",
    border: "0",
    outline: "0",
    background: "transparent",
    color: "#111827",
    fontSize: "15px",
    fontWeight: 800,
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  eyeButton: {
    position: "absolute",
    right: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    width: "34px",
    height: "34px",
    border: "0",
    borderRadius: "10px",
    background: "transparent",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },
  loginButton: {
    width: "100%",
    height: "56px",
    border: "0",
    borderRadius: "16px",
    background: "#ff5733",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    fontSize: "18px",
    fontWeight: 900,
    cursor: "pointer",
    marginTop: "22px",
    boxShadow: "0 14px 30px rgba(255, 87, 51, 0.2)",
  },
};

export default LoginPage;