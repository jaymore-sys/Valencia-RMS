import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
  Wrench,
  X,
} from "lucide-react";

import api from "../../api/axios";
import "./administratorProfile.css";

const splitSkills = (value) => {
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const AdministratorProfile = () => {
  const [profile, setProfile] = useState(null);

  const [skills, setSkills] = useState("");
  const [editingSkills, setEditingSkills] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [savingSkills, setSavingSkills] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/administrator/profile");

      const nextProfile = response.data?.profile || null;

      setProfile(nextProfile);
      setSkills(nextProfile?.skills || "");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to load profile."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const skillList = useMemo(() => splitSkills(skills), [skills]);

  const saveSkills = async () => {
    try {
      setSavingSkills(true);
      setError("");
      setSuccessMessage("");

      const response = await api.put(
        "/administrator/profile/skills",
        {
          skills,
        }
      );

      setSuccessMessage(
        response.data?.message ||
          "Skills updated successfully."
      );

      setEditingSkills(false);

      await fetchProfile();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to update skills."
      );
    } finally {
      setSavingSkills(false);
    }
  };

  const cancelSkillsEdit = () => {
    setSkills(profile?.skills || "");
    setEditingSkills(false);
  };

  const changePassword = async (event) => {
    event.preventDefault();

    setError("");
    setSuccessMessage("");

    if (!oldPassword) {
      setError("Please enter your current password.");
      return;
    }

    if (!newPassword) {
      setError("Please enter a new password.");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    if (oldPassword === newPassword) {
      setError(
        "New password must be different from your current password."
      );
      return;
    }

    try {
      setChangingPassword(true);

      const response = await api.put(
        "/administrator/profile/change-password",
        {
          oldPassword,
          newPassword,
        }
      );

      setSuccessMessage(
        response.data?.message ||
          "Password changed successfully."
      );

      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setShowOldPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to change password."
      );
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading && !profile) {
    return (
      <div className="administrator-profile-loader">
        Loading profile...
      </div>
    );
  }

  return (
    <div className="administrator-profile-page">
      <section className="administrator-profile-page-header">
        <div>
          <h1>Profile</h1>

          <p>
            View your Administrator profile, update skills and
            change your password.
          </p>
        </div>

        <button
          type="button"
          className="administrator-profile-refresh-btn"
          onClick={fetchProfile}
          disabled={loading}
        >
          <RefreshCw
            size={16}
            className={
              loading
                ? "administrator-profile-spin"
                : ""
            }
          />

          {loading
            ? "Refreshing..."
            : "Refresh"}
        </button>
      </section>

      {error && (
        <div className="administrator-profile-message error">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="administrator-profile-message success">
          <Check size={17} />

          {successMessage}
        </div>
      )}

      <div className="administrator-profile-main-grid">
        <section className="administrator-profile-panel administrator-profile-details-panel">
          <div className="administrator-profile-section-heading">
            <div className="administrator-profile-section-icon">
              <UserRound size={21} />
            </div>

            <div>
              <h2>Administrator Details</h2>

              <p>
                Your information as saved in Valencia RMS.
              </p>
            </div>
          </div>

          <div className="administrator-profile-details-grid">
            <ProfileDetail
              label="Name"
              value={profile?.full_name}
            />

            <ProfileDetail
              label="Email"
              value={profile?.email}
            />

            <ProfileDetail
              label="Phone"
              value={profile?.phone}
            />

            <ProfileDetail
              label="Department"
              value={profile?.department_name}
            />

            <ProfileDetail
              label="Designation"
              value={profile?.designation}
            />

            <ProfileDetail
              label="Employee Code"
              value={profile?.employee_code}
            />

            <ProfileDetail
              label="Role"
              value={profile?.role_name}
            />

            <ProfileDetail
              label="Status"
              value={profile?.status}
            />

            <ProfileDetail
              label="User ID"
              value={profile?.user_id}
            />
          </div>
        </section>

        <div className="administrator-profile-side-column">
          <section className="administrator-profile-panel">
            <div className="administrator-profile-panel-top">
              <div className="administrator-profile-section-heading compact">
                <div className="administrator-profile-section-icon">
                  <Wrench size={20} />
                </div>

                <div>
                  <h2>Skills</h2>

                  <p>
                    Tools, strengths and expertise.
                  </p>
                </div>
              </div>

              {!editingSkills ? (
                <button
                  type="button"
                  className="administrator-profile-outline-btn"
                  onClick={() =>
                    setEditingSkills(true)
                  }
                >
                  Edit Skills
                </button>
              ) : (
                <button
                  type="button"
                  className="administrator-profile-icon-cancel-btn"
                  onClick={cancelSkillsEdit}
                  disabled={savingSkills}
                  title="Cancel editing"
                >
                  <X size={17} />
                </button>
              )}
            </div>

            {!editingSkills ? (
              skillList.length > 0 ? (
                <div className="administrator-profile-skill-list">
                  {skillList.map((skill, index) => (
                    <span
                      key={`${skill}-${index}`}
                      className="administrator-profile-skill-chip"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="administrator-profile-empty-skills">
                  No skills added yet.
                </div>
              )
            ) : (
              <div className="administrator-profile-skill-editor">
                <textarea
                  value={skills}
                  onChange={(event) =>
                    setSkills(event.target.value)
                  }
                  placeholder="Example: React, Node.js, MySQL, Project Management, Excel..."
                />

                <p>
                  Separate skills using commas or new lines.
                </p>

                <div className="administrator-profile-skill-actions">
                  <button
                    type="button"
                    className="administrator-profile-secondary-btn"
                    onClick={cancelSkillsEdit}
                    disabled={savingSkills}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="administrator-profile-primary-btn"
                    onClick={saveSkills}
                    disabled={savingSkills}
                  >
                    <Save size={16} />

                    {savingSkills
                      ? "Saving..."
                      : "Save Skills"}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="administrator-profile-panel">
            <div className="administrator-profile-section-heading compact">
              <div className="administrator-profile-section-icon">
                <KeyRound size={20} />
              </div>

              <div>
                <h2>Change Password</h2>

                <p>
                  Confirm your current password before setting a new one.
                </p>
              </div>
            </div>

            <form
              className="administrator-profile-password-form"
              onSubmit={changePassword}
            >
              <PasswordField
                label="Current Password"
                value={oldPassword}
                onChange={setOldPassword}
                visible={showOldPassword}
                onToggle={() =>
                  setShowOldPassword(
                    (previous) => !previous
                  )
                }
                placeholder="Enter current password"
              />

              <PasswordField
                label="New Password"
                value={newPassword}
                onChange={setNewPassword}
                visible={showNewPassword}
                onToggle={() =>
                  setShowNewPassword(
                    (previous) => !previous
                  )
                }
                placeholder="Minimum 8 characters"
              />

              <PasswordField
                label="Confirm New Password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                visible={showConfirmPassword}
                onToggle={() =>
                  setShowConfirmPassword(
                    (previous) => !previous
                  )
                }
                placeholder="Re-enter new password"
              />

              <div className="administrator-profile-password-note">
                <ShieldCheck size={16} />

                <span>
                  Your current password is verified before
                  the new password is saved.
                </span>
              </div>

              <button
                type="submit"
                className="administrator-profile-primary-btn administrator-profile-password-submit"
                disabled={changingPassword}
              >
                <KeyRound size={16} />

                {changingPassword
                  ? "Changing Password..."
                  : "Change Password"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};

const ProfileDetail = ({ label, value }) => {
  return (
    <div className="administrator-profile-detail">
      <span>{label}</span>

      <strong>
        {value === null ||
        value === undefined ||
        value === ""
          ? "-"
          : value}
      </strong>
    </div>
  );
};

const PasswordField = ({
  label,
  value,
  onChange,
  visible,
  onToggle,
  placeholder,
}) => {
  return (
    <label className="administrator-profile-password-field">
      <span>{label}</span>

      <div className="administrator-profile-password-wrap">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder={placeholder}
          autoComplete="new-password"
        />

        <button
          type="button"
          className="administrator-profile-password-eye"
          onClick={onToggle}
          title={
            visible
              ? "Hide password"
              : "Show password"
          }
        >
          {visible ? (
            <EyeOff size={18} />
          ) : (
            <Eye size={18} />
          )}
        </button>
      </div>
    </label>
  );
};

export default AdministratorProfile;
