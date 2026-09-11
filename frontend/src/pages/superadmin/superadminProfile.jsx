import React, { useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  X,
} from "lucide-react";

import api from "../../api/axios";


const getStoredUser = () => {
  try {
    return JSON.parse(
      sessionStorage.getItem("user") ||
        localStorage.getItem("user") ||
        "{}"
    );
  } catch {
    return {};
  }
};


const getInitials = (name) => {
  const cleanName = String(
    name || "Superadmin"
  ).trim();

  const initials = cleanName
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return initials || "SA";
};


const SuperadminProfile = () => {
  const storedUser = getStoredUser();

  const [profile, setProfile] =
    useState(storedUser);

  const [error, setError] =
    useState("");

  const [
    showPasswordBox,
    setShowPasswordBox,
  ] = useState(false);

  const [
    passwordMessage,
    setPasswordMessage,
  ] = useState("");

  const [
    passwordForm,
    setPasswordForm,
  ] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [
    showPasswords,
    setShowPasswords,
  ] = useState({
    old: false,
    new: false,
    confirm: false,
  });


  const fetchProfile = async () => {
    try {
      setError("");

      const response = await api.get(
        "/admin-profile/me"
      );

      const data =
        response.data?.profile ||
        response.data?.admin ||
        response.data?.user ||
        response.data?.data ||
        response.data ||
        {};

      setProfile({
        ...storedUser,
        ...data,
      });
    } catch (err) {
      console.error(
        "Fetch superadmin profile error:",
        err
      );

      setError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Failed to fetch Superadmin profile."
      );

      setProfile(storedUser);
    }
  };


  useEffect(() => {
    fetchProfile();
  }, []);


  const changePassword = async () => {
    setPasswordMessage("");

    if (
      !passwordForm.oldPassword ||
      !passwordForm.newPassword ||
      !passwordForm.confirmPassword
    ) {
      setPasswordMessage(
        "All fields are required"
      );

      return;
    }

    if (
      passwordForm.newPassword !==
      passwordForm.confirmPassword
    ) {
      setPasswordMessage(
        "New passwords do not match"
      );

      return;
    }

    try {
      const response = await api.put(
        "/admin-profile/change-password",
        {
          oldPassword:
            passwordForm.oldPassword,

          newPassword:
            passwordForm.newPassword,
        }
      );

      setPasswordMessage(
        response.data?.message ||
          "Password changed successfully"
      );

      setPasswordForm({
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (err) {
      setPasswordMessage(
        err?.response?.data?.message ||
          "Password change failed"
      );
    }
  };


  const superadminName =
    profile?.full_name ||
    profile?.name ||
    "Superadmin";

  const superadminEmail =
    profile?.email || "-";

  const superadminRole =
    profile?.role_name ||
    profile?.role ||
    "superadmin";


  return (
    <div style={styles.page}>

      {error && (
        <div style={styles.errorBox}>
          {error}
        </div>
      )}

      <section
        style={
          styles.profileSummaryBlock
        }
      >
        <div style={styles.avatarBox}>
          <div style={styles.avatar}>
            {getInitials(
              superadminName
            )}
          </div>
        </div>


        <div style={styles.infoBox}>

          <p style={styles.smallLabel}>
            Superadmin Details
          </p>

          <h1
            style={styles.profileName}
          >
            {superadminName}
          </h1>

          <p
            style={styles.profileEmail}
          >
            {superadminEmail}
          </p>


          <div style={styles.badgeRow}>
            <span
              style={
                styles.roleBadge
              }
            >
              {superadminRole}
            </span>
          </div>


          <button
            type="button"
            style={
              styles.passwordButton
            }
            onClick={() =>
              setShowPasswordBox(true)
            }
          >
            <Lock size={16} />

            Change Password
          </button>

        </div>
      </section>


      {showPasswordBox && (

        <div
          style={
            styles.passwordOverlay
          }
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setShowPasswordBox(false);
              setPasswordMessage("");
            }
          }}
        >

          <div
            style={
              styles.passwordModal
            }
          >

            <button
              type="button"
              style={
                styles.closePasswordModal
              }
              onClick={() => {
                setShowPasswordBox(false);
                setPasswordMessage("");
              }}
            >
              <X size={20} />
            </button>


            <h2
              style={
                styles.modalTitle
              }
            >
              Change Password
            </h2>


            {passwordMessage && (
              <p
                style={
                  styles.passwordMessage
                }
              >
                {passwordMessage}
              </p>
            )}


            <div
              style={
                styles.passwordField
              }
            >

              <input
                type={
                  showPasswords.old
                    ? "text"
                    : "password"
                }
                placeholder="Current Password"
                value={
                  passwordForm.oldPassword
                }
                onChange={(event) =>
                  setPasswordForm({
                    ...passwordForm,

                    oldPassword:
                      event.target.value,
                  })
                }
                style={
                  styles.passwordInput
                }
              />


              <button
                type="button"
                style={
                  styles.eyeButton
                }
                onClick={() =>
                  setShowPasswords({
                    ...showPasswords,

                    old:
                      !showPasswords.old,
                  })
                }
              >
                {showPasswords.old ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>

            </div>


            <div
              style={
                styles.passwordField
              }
            >

              <input
                type={
                  showPasswords.new
                    ? "text"
                    : "password"
                }
                placeholder="New Password"
                value={
                  passwordForm.newPassword
                }
                onChange={(event) =>
                  setPasswordForm({
                    ...passwordForm,

                    newPassword:
                      event.target.value,
                  })
                }
                style={
                  styles.passwordInput
                }
              />


              <button
                type="button"
                style={
                  styles.eyeButton
                }
                onClick={() =>
                  setShowPasswords({
                    ...showPasswords,

                    new:
                      !showPasswords.new,
                  })
                }
              >
                {showPasswords.new ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>

            </div>


            <div
              style={
                styles.passwordField
              }
            >

              <input
                type={
                  showPasswords.confirm
                    ? "text"
                    : "password"
                }
                placeholder="Confirm Password"
                value={
                  passwordForm.confirmPassword
                }
                onChange={(event) =>
                  setPasswordForm({
                    ...passwordForm,

                    confirmPassword:
                      event.target.value,
                  })
                }
                style={
                  styles.passwordInput
                }
              />


              <button
                type="button"
                style={
                  styles.eyeButton
                }
                onClick={() =>
                  setShowPasswords({
                    ...showPasswords,

                    confirm:
                      !showPasswords.confirm,
                  })
                }
              >
                {showPasswords.confirm ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>

            </div>


            <div
              style={
                styles.passwordActions
              }
            >

              <button
                type="button"
                style={
                  styles.cancelButton
                }
                onClick={() => {
                  setShowPasswordBox(false);
                  setPasswordMessage("");
                }}
              >
                Cancel
              </button>


              <button
                type="button"
                style={
                  styles.saveButton
                }
                onClick={
                  changePassword
                }
              >
                Save Password
              </button>

            </div>

          </div>
        </div>

      )}

    </div>
  );
};


const styles = {

  page: {
    width: "100%",
    minHeight: "100%",
  },


  errorBox: {
    background: "#fff1f2",
    color: "#b91c1c",
    border:
      "1px solid #fecdd3",
    borderRadius: "18px",
    padding: "16px 18px",
    fontSize: "15px",
    fontWeight: 800,
    marginBottom: "22px",
  },


  profileSummaryBlock: {
    width: "100%",
    minHeight: "250px",
    background: "#ffffff",
    borderRadius: "28px",
    padding: "34px",

    boxShadow:
      "0 18px 46px rgba(15, 23, 42, 0.07)",

    display: "grid",
    gridTemplateColumns:
      "220px 1fr",

    gap: "30px",
    alignItems: "center",
  },


  avatarBox: {
    width: "220px",
    height: "190px",

    borderRadius: "24px",

    background:
      "linear-gradient(180deg, #fff7f5 0%, #ffffff 100%)",

    border:
      "1px solid #fee2dc",

    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },


  avatar: {
    width: "118px",
    height: "118px",

    borderRadius: "30px",

    background: "#ff5733",
    color: "#ffffff",

    display: "grid",
    placeItems: "center",

    fontSize: "44px",
    fontWeight: 900,

    boxShadow:
      "0 18px 36px rgba(255, 87, 51, 0.26)",
  },


  infoBox: {
    minWidth: 0,
  },


  smallLabel: {
    margin: "0 0 10px",

    color: "#ff5733",

    fontSize: "15px",
    fontWeight: 900,

    textTransform:
      "uppercase",

    letterSpacing:
      "0.04em",
  },


  profileName: {
    margin: "0 0 10px",

    color: "#111827",

    fontSize: "38px",
    fontWeight: 900,

    lineHeight: 1.1,

    overflowWrap:
      "anywhere",
  },


  profileEmail: {
    margin: "0 0 18px",

    color: "#64748b",

    fontSize: "17px",
    fontWeight: 800,

    lineHeight: 1.35,

    overflowWrap:
      "anywhere",
  },


  badgeRow: {
    display: "flex",
    alignItems: "center",

    gap: "12px",

    flexWrap: "wrap",
  },


  roleBadge: {
    background: "#ff5733",
    color: "#ffffff",

    borderRadius: "999px",

    padding: "10px 18px",

    fontSize: "14px",
    fontWeight: 900,

    textTransform:
      "capitalize",
  },


  passwordButton: {
    marginTop: "20px",

    border: "none",
    background:
      "transparent",

    color: "#ff5733",

    fontSize: "15px",
    fontWeight: 900,

    cursor: "pointer",

    display: "flex",
    alignItems: "center",

    gap: "8px",

    padding: 0,
  },


  passwordOverlay: {
    position: "fixed",

    inset: 0,

    background:
      "rgba(15, 23, 42, 0.32)",

    display: "flex",
    alignItems: "center",
    justifyContent:
      "center",

    zIndex: 9999,

    padding: "20px",
  },


  passwordModal: {
    width: "420px",
    maxWidth: "100%",

    background: "#ffffff",

    borderRadius: "24px",

    padding: "30px",

    position: "relative",

    boxShadow:
      "0 20px 50px rgba(0,0,0,.15)",
  },


  modalTitle: {
    margin: "0 0 24px",

    fontSize: "24px",
    fontWeight: 900,

    color: "#111827",
  },


  passwordField: {
    position: "relative",

    marginBottom: "15px",
  },


  passwordInput: {
    width: "100%",
    height: "48px",

    border:
      "1px solid #d6dde8",

    borderRadius: "14px",

    padding:
      "0 45px 0 15px",

    fontSize: "15px",

    outline: "none",

    color: "#111827",

    background: "#ffffff",
  },


  eyeButton: {
    position: "absolute",

    right: "12px",
    top: "50%",

    transform:
      "translateY(-50%)",

    border: "none",

    background:
      "transparent",

    cursor: "pointer",

    color: "#64748b",

    display: "flex",
    alignItems: "center",
    justifyContent:
      "center",

    padding: "4px",
  },


  passwordActions: {
    display: "flex",

    justifyContent:
      "flex-end",

    gap: "12px",

    marginTop: "20px",
  },


  cancelButton: {
    border:
      "1px solid #e5e7eb",

    background: "#ffffff",

    color: "#111827",

    padding: "12px 22px",

    borderRadius: "12px",

    cursor: "pointer",

    fontWeight: 800,
    fontSize: "15px",
  },


  saveButton: {
    border: "none",

    background: "#ff5733",

    color: "#ffffff",

    padding: "12px 22px",

    borderRadius: "12px",

    fontWeight: 900,
    fontSize: "15px",

    cursor: "pointer",
  },


  passwordMessage: {
    color: "#ff5733",

    fontWeight: 800,

    margin:
      "0 0 15px",
  },


  closePasswordModal: {
    position: "absolute",

    top: "18px",
    right: "18px",

    border: "none",

    background:
      "transparent",

    cursor: "pointer",

    color: "#64748b",

    display: "flex",
    alignItems: "center",
    justifyContent:
      "center",

    padding: "4px",
  },

};


export default SuperadminProfile;