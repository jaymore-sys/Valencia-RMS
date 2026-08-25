import { useEffect, useRef, useState } from "react";
import {
  Download,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import api from "../../api/axios";
import "./administratorUsers.css";

const fixedDepartments = [
  "IT",
  "Sales",
  "Creatives",
  "Finance",
  "Nutracare",
  "POS",
];

const emptyForm = {
  employee_code: "",
  full_name: "",
  email: "",
  phone: "",
  designation: "",
  department_name: "",
  role_name: "employee",
};

const AdministratorUsers = () => {
  const fileInputRef = useRef(null);

  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);

  const [form, setForm] = useState(emptyForm);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const [message, setMessage] = useState("");

  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedEmail, setSelectedEmail] = useState("");
  const [selectedDesignation, setSelectedDesignation] = useState("");
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState([]);

  const [updatingRole, setUpdatingRole] = useState(false);
  const [updatingDetails, setUpdatingDetails] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setMessage("");

      const [usersResponse, metaResponse] = await Promise.all([
        api.get("/administrator/users"),
        api.get("/administrator/users/meta"),
      ]);

      setUsers(usersResponse.data.users || []);
      setDepartments(metaResponse.data.departments || []);
      setRoles(metaResponse.data.roles || []);
    } catch (error) {
      console.error("FETCH USERS ERROR:", error);

      setMessage(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to load users."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const visibleDepartments = departments.filter((department) =>
    fixedDepartments.includes(department.department_name)
  );

  const filteredUsers = users.filter((user) => {
    const value = search.trim().toLowerCase();

    return (
      user.full_name?.toLowerCase().includes(value) ||
      user.email?.toLowerCase().includes(value) ||
      String(user.employee_code || "").toLowerCase().includes(value) ||
      user.designation?.toLowerCase().includes(value) ||
      user.department_name?.toLowerCase().includes(value) ||
      user.department_names?.toLowerCase().includes(value) ||
      user.role_name?.toLowerCase().includes(value) ||
      user.status?.toLowerCase().includes(value)
    );
  });

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const createUser = async (event) => {
    event.preventDefault();

    try {
      setCreating(true);
      setMessage("");

      const response = await api.post("/administrator/users", form);

      setMessage(
        `${response.data.message || "User created successfully."} Default Password: ${
          response.data.default_password || "Valencia@123"
        }`
      );

      setForm(emptyForm);

      await fetchUsers();
    } catch (error) {
      console.error("CREATE USER ERROR:", error);

      setMessage(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to create user."
      );
    } finally {
      setCreating(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const importUsers = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setImporting(true);
      setMessage("");

      const response = await api.post(
        "/administrator/users/import",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      setMessage(response.data.message || "Users imported successfully.");

      await fetchUsers();
    } catch (error) {
      console.error("IMPORT USERS ERROR:", error);

      setMessage(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to import users."
      );
    } finally {
      setImporting(false);

      if (event.target) {
        event.target.value = "";
      }
    }
  };

  const getUserDepartmentIds = (user) => {
    if (!user) {
      return [];
    }

    if (Array.isArray(user.department_ids)) {
      return user.department_ids.map(Number).filter(Boolean);
    }

    if (user.department_ids) {
      return String(user.department_ids)
        .split(",")
        .map((id) => Number(String(id).trim()))
        .filter(Boolean);
    }

    if (user.department_id) {
      return [Number(user.department_id)].filter(Boolean);
    }

    if (user.department_name) {
      const matchingDepartment = departments.find(
        (department) =>
          String(department.department_name || "")
            .trim()
            .toLowerCase() ===
          String(user.department_name || "")
            .trim()
            .toLowerCase()
      );

      if (matchingDepartment) {
        return [Number(matchingDepartment.department_id)];
      }
    }

    return [];
  };

  const openUserDialog = (user) => {
    setSelectedUser(user);
    setSelectedRole(user.role_name || "employee");
    setSelectedEmail(user.email || "");
    setSelectedDesignation(user.designation || "");
    setSelectedDepartmentIds(getUserDepartmentIds(user));

    setNewPassword("");
    setShowPassword(false);
    setMessage("");
  };

  const closeUserDialog = () => {
    setSelectedUser(null);
    setSelectedRole("");
    setSelectedEmail("");
    setSelectedDesignation("");
    setSelectedDepartmentIds([]);

    setNewPassword("");
    setShowPassword(false);

    setUpdatingRole(false);
    setUpdatingDetails(false);
    setUpdatingPassword(false);
  };

  const handleRoleChange = (roleName) => {
    setSelectedRole(roleName);

    if (
      roleName !== "admin" &&
      selectedDepartmentIds.length > 1
    ) {
      setSelectedDepartmentIds([selectedDepartmentIds[0]]);
    }
  };

  const toggleDepartment = (departmentId) => {
    const numericId = Number(departmentId);

    if (selectedRole !== "admin") {
      setSelectedDepartmentIds([numericId]);
      return;
    }

    setSelectedDepartmentIds((current) => {
      if (current.includes(numericId)) {
        return current.filter((id) => id !== numericId);
      }

      return [...current, numericId];
    });
  };

  const handleSingleDepartmentChange = (event) => {
    const departmentId = Number(event.target.value);

    if (!departmentId) {
      setSelectedDepartmentIds([]);
      return;
    }

    setSelectedDepartmentIds([departmentId]);
  };

  const updateUserDetails = async () => {
    if (!selectedUser) {
      return;
    }

    const cleanEmail = selectedEmail.trim().toLowerCase();

    if (!cleanEmail) {
      setMessage("Please enter an email.");
      return;
    }

    if (selectedDepartmentIds.length === 0) {
      setMessage("Please select at least one department.");
      return;
    }

    try {
      setUpdatingDetails(true);
      setMessage("");

      const response = await api.put(
        `/administrator/users/${selectedUser.user_id}/details`,
        {
          email: cleanEmail,
          designation: selectedDesignation.trim(),
          department_ids: selectedDepartmentIds,
        }
      );

      setMessage(
        response.data.message || "User details updated successfully."
      );

      await fetchUsers();
      closeUserDialog();
    } catch (error) {
      console.error("UPDATE USER DETAILS ERROR:", error);

      setMessage(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to update user details."
      );
    } finally {
      setUpdatingDetails(false);
    }
  };

  const updateUserRole = async () => {
    if (!selectedUser) {
      return;
    }

    try {
      setUpdatingRole(true);
      setMessage("");

      const response = await api.put(
        `/administrator/users/${selectedUser.user_id}/role`,
        {
          role_name: selectedRole,
        }
      );

      setMessage(
        response.data.message || "User role updated successfully."
      );

      await fetchUsers();
      closeUserDialog();
    } catch (error) {
      console.error("UPDATE USER ROLE ERROR:", error);

      setMessage(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to update user role."
      );
    } finally {
      setUpdatingRole(false);
    }
  };

  const updateUserPassword = async () => {
    if (!selectedUser) {
      return;
    }

    if (!newPassword) {
      setMessage("Please enter a new password.");
      return;
    }

    if (newPassword.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }

    const confirmed = window.confirm(
      `Change password for ${selectedUser.full_name}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setUpdatingPassword(true);
      setMessage("");

      const response = await api.put(
        `/administrator/users/${selectedUser.user_id}/password`,
        {
          password: newPassword,
        }
      );

      setMessage(
        response.data.message || "Password updated successfully."
      );

      setNewPassword("");
      setShowPassword(false);
    } catch (error) {
      console.error("UPDATE USER PASSWORD ERROR:", error);

      setMessage(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to update password."
      );
    } finally {
      setUpdatingPassword(false);
    }
  };

  const resetPassword = async (userId) => {
    const confirmed = window.confirm(
      "Reset this user's password to Valencia@123?"
    );

    if (!confirmed) {
      return;
    }

    try {
      setMessage("");

      const response = await api.put(
        `/administrator/users/${userId}/reset-password`
      );

      setMessage(
        `${response.data.message || "Password reset successfully."} Default Password: ${
          response.data.default_password || "Valencia@123"
        }`
      );

      closeUserDialog();
    } catch (error) {
      console.error("RESET PASSWORD ERROR:", error);

      setMessage(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to reset password."
      );
    }
  };

  const updateUserStatus = async (userId, status) => {
    try {
      setMessage("");

      const response = await api.put(
        `/administrator/users/${userId}/status`,
        {
          status,
        }
      );

      setMessage(
        response.data.message || "User status updated successfully."
      );

      await fetchUsers();
      closeUserDialog();
    } catch (error) {
      console.error("UPDATE STATUS ERROR:", error);

      setMessage(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to update user status."
      );
    }
  };

  const deleteUser = async (userId) => {
    const confirmed = window.confirm(
      "Delete this user? This will remove access but keep records safe."
    );

    if (!confirmed) {
      return;
    }

    try {
      setMessage("");

      const response = await api.delete(
        `/administrator/users/${userId}`
      );

      setMessage(
        response.data.message || "User deleted successfully."
      );

      await fetchUsers();
      closeUserDialog();
    } catch (error) {
      console.error("DELETE USER ERROR:", error);

      setMessage(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete user."
      );
    }
  };

  const exportUsersCsv = () => {
    const headers = [
      "employee_code",
      "full_name",
      "email",
      "phone",
      "designation",
      "department_names",
      "role_name",
      "status",
    ];

    const rows = filteredUsers.map((user) =>
      headers
        .map((header) => {
          let value = user[header];

          if (
            header === "department_names" &&
            !value
          ) {
            value = user.department_name || "";
          }

          const stringValue = String(value || "");

          if (
            stringValue.includes(",") ||
            stringValue.includes('"') ||
            stringValue.includes("\n")
          ) {
            return `"${stringValue.replaceAll('"', '""')}"`;
          }

          return stringValue;
        })
        .join(",")
    );

    const csvContent = [
      headers.join(","),
      ...rows,
    ].join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.setAttribute(
      "download",
      "valencia-rms-users.csv"
    );

    document.body.appendChild(link);

    link.click();
    link.remove();

    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="users-page">
      <div className="administrator-users-header">
        <div className="administrator-users-heading">
          <h1>Users</h1>

          <p>
            Add, import, edit, assign departments, manage
            passwords, block and delete users.
          </p>
        </div>

        <div className="administrator-users-header-actions">
          <button
            type="button"
            className="administrator-users-header-btn"
            onClick={fetchUsers}
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            className="administrator-users-header-btn"
            onClick={exportUsersCsv}
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            className="administrator-users-header-btn"
            onClick={handleImportClick}
            disabled={importing}
          >
            <Upload size={14} />

            <span>
              {importing
                ? "Importing..."
                : "Import Users"}
            </span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={importUsers}
          />
        </div>
      </div>

      {message && (
        <div className="projects-message">
          {message}
        </div>
      )}

      <div className="user-form-card">
        <div className="section-title-row">
          <div>
            <h2>Add Single User</h2>

            <p>
              New users receive default password:
              Valencia@123
            </p>
          </div>
        </div>

        <form
          className="user-form-grid"
          onSubmit={createUser}
        >
          <div className="form-field">
            <label>Employee Code</label>

            <input
              value="Auto generated"
              disabled
              className="disabled-input"
              readOnly
            />
          </div>

          <div className="form-field">
            <label>Full Name *</label>

            <input
              name="full_name"
              value={form.full_name}
              onChange={handleChange}
              placeholder="Employee name"
              required
            />
          </div>

          <div className="form-field">
            <label>Email *</label>

            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="name@valencianutrition.com"
              required
            />
          </div>

          <div className="form-field">
            <label>Phone</label>

            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="Phone number"
            />
          </div>

          <div className="form-field">
            <label>Designation</label>

            <input
              name="designation"
              value={form.designation}
              onChange={handleChange}
              placeholder="Designation"
            />
          </div>

          <div className="form-field">
            <label>Department</label>

            <select
              name="department_name"
              value={form.department_name}
              onChange={handleChange}
            >
              <option value="">
                Select department
              </option>

              {fixedDepartments.map((department) => (
                <option
                  key={department}
                  value={department}
                >
                  {department}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Role</label>

            <select
              name="role_name"
              value={form.role_name}
              onChange={handleChange}
            >
              {roles.map((role) => (
                <option
                  key={role.role_id}
                  value={role.role_name}
                >
                  {role.role_name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-submit-field">
            <button
              className="primary-action-btn"
              type="submit"
              disabled={creating}
            >
              <UserPlus size={16} />

              {creating
                ? "Creating..."
                : "Create User"}
            </button>
          </div>
        </form>
      </div>

      <div className="projects-toolbar">
        <div className="projects-search">
          <Search size={16} />

          <input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search users, email, role, department, status..."
          />
        </div>
      </div>

      {loading ? (
        <div className="page-loader">
          Loading users...
        </div>
      ) : (
        <div className="projects-table-card administrator-users-table-card">
          <table className="projects-table users-table administrator-users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Department</th>
                <th>Designation</th>
              </tr>
            </thead>

            <tbody>
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
                  <tr
                    key={user.user_id}
                    className="clickable-user-row"
                    onClick={() =>
                      openUserDialog(user)
                    }
                  >
                    <td>
                      <div className="user-name-cell">
                        <div className="user-avatar-small">
                          <Users size={16} />
                        </div>

                        <div>
                          <strong>
                            {user.full_name}
                          </strong>

                          <p>{user.email}</p>

                          <p>
                            {user.employee_code ||
                              "Code not generated yet"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="role-badge">
                        {user.role_name}
                      </span>
                    </td>

                    <td>
                      {user.department_names ||
                        user.department_name ||
                        "-"}
                    </td>

                    <td>
                      {user.designation || "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="4"
                    className="empty-projects"
                  >
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="csv-help-card">
        <h3>CSV Import Format</h3>

        <p>
          Supported columns:
          <strong>
            {" "}
            employee_code, full_name, email, phone,
            designation, department_name, role_name
          </strong>
        </p>

        <p className="csv-note">
          Employee code will be auto-generated when
          administrator saves employee details.
        </p>
      </div>

      {selectedUser && (
        <div
          className="user-dialog-backdrop"
          onClick={closeUserDialog}
        >
          <div
            className="user-dialog"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="user-dialog-header">
              <div>
                <h2>
                  {selectedUser.full_name}
                </h2>

                <p>
                  {selectedEmail}
                </p>
              </div>

              <button
                type="button"
                className="dialog-close-btn"
                onClick={closeUserDialog}
              >
                <X size={18} />
              </button>
            </div>

            <div className="user-dialog-grid">
              <div className="dialog-field">
                <label>
                  Employee Code
                </label>

                <p>
                  {selectedUser.employee_code ||
                    "Will be generated automatically after saving details"}
                </p>
              </div>

              <div className="dialog-field">
                <label>
                  Current Role
                </label>

                <p>
                  {selectedUser.role_name || "-"}
                </p>
              </div>

              <div className="dialog-field">
                <label>Email</label>

                <input
                  type="email"
                  value={selectedEmail}
                  onChange={(event) =>
                    setSelectedEmail(
                      event.target.value
                    )
                  }
                  placeholder="Email address"
                />
              </div>

              <div className="dialog-field">
                <label>
                  Designation
                </label>

                <input
                  value={selectedDesignation}
                  onChange={(event) =>
                    setSelectedDesignation(
                      event.target.value
                    )
                  }
                  placeholder="Enter designation"
                />
              </div>

              <div className="dialog-field">
                <label>Status</label>

                <p>
                  {selectedUser.status || "-"}
                </p>
              </div>

              <div className="dialog-field">
                <label>Skills</label>

                <p>
                  {selectedUser.skills || "-"}
                </p>
              </div>

              <div className="dialog-field administrator-multi-department-field">
                <label>
                  {selectedRole === "admin"
                    ? "Admin Departments"
                    : "Department"}
                </label>

                {selectedRole === "admin" ? (
                  <>
                    <p className="administrator-department-help">
                      Select all departments this Admin should manage.
                    </p>

                    <div className="administrator-department-options">
                      {visibleDepartments.map(
                        (department) => {
                          const departmentId =
                            Number(
                              department.department_id
                            );

                          const checked =
                            selectedDepartmentIds.includes(
                              departmentId
                            );

                          return (
                            <label
                              key={
                                department.department_id
                              }
                              className={`administrator-department-option ${
                                checked
                                  ? "selected"
                                  : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  toggleDepartment(
                                    departmentId
                                  )
                                }
                              />

                              <span>
                                {
                                  department.department_name
                                }
                              </span>
                            </label>
                          );
                        }
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="administrator-department-help">
                      Select the user&apos;s department.
                    </p>

                    <select
                      className="administrator-single-department-select"
                      value={
                        selectedDepartmentIds.length > 0
                          ? selectedDepartmentIds[0]
                          : ""
                      }
                      onChange={
                        handleSingleDepartmentChange
                      }
                    >
                      <option value="">
                        Select department
                      </option>

                      {visibleDepartments.map(
                        (department) => (
                          <option
                            key={
                              department.department_id
                            }
                            value={
                              department.department_id
                            }
                          >
                            {
                              department.department_name
                            }
                          </option>
                        )
                      )}
                    </select>
                  </>
                )}
              </div>

              <div className="dialog-save-details-row">
                <button
                  type="button"
                  className="primary-action-btn"
                  onClick={updateUserDetails}
                  disabled={updatingDetails}
                >
                  <Save size={16} />

                  {updatingDetails
                    ? "Saving..."
                    : "Save Details"}
                </button>
              </div>
            </div>

            <div className="dialog-role-section">
              <label>Change Role</label>

              <div className="dialog-role-control">
                <select
                  value={selectedRole}
                  onChange={(event) =>
                    handleRoleChange(
                      event.target.value
                    )
                  }
                >
                  {roles.map((role) => (
                    <option
                      key={role.role_id}
                      value={role.role_name}
                    >
                      {role.role_name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="primary-action-btn"
                  onClick={updateUserRole}
                  disabled={updatingRole}
                >
                  <Save size={16} />

                  {updatingRole
                    ? "Saving..."
                    : "Save Role"}
                </button>
              </div>
            </div>

            <div className="administrator-user-password-section">
              <div className="administrator-user-password-title">
                <div>
                  <h3>
                    Set New Password
                  </h3>

                  <p>
                    Existing passwords cannot be viewed.
                    You can set a new password for this user.
                  </p>
                </div>

                <Lock size={20} />
              </div>

              <div className="administrator-user-password-row">
                <div className="administrator-user-password-input">
                  <input
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    value={newPassword}
                    onChange={(event) =>
                      setNewPassword(
                        event.target.value
                      )
                    }
                    placeholder="Enter new password"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (previous) =>
                          !previous
                      )
                    }
                  >
                    {showPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  className="primary-action-btn"
                  onClick={updateUserPassword}
                  disabled={
                    updatingPassword ||
                    newPassword.length < 8
                  }
                >
                  <Save size={16} />

                  {updatingPassword
                    ? "Saving..."
                    : "Save Password"}
                </button>
              </div>
            </div>

            <div className="dialog-actions">
              <button
                type="button"
                className="dialog-action-btn"
                onClick={() =>
                  resetPassword(
                    selectedUser.user_id
                  )
                }
              >
                <Lock size={16} />
                Reset Password
              </button>

              {selectedUser.status === "blocked" ? (
                <button
                  type="button"
                  className="dialog-action-btn"
                  onClick={() =>
                    updateUserStatus(
                      selectedUser.user_id,
                      "active"
                    )
                  }
                >
                  <ShieldCheck size={16} />
                  Unblock User
                </button>
              ) : (
                <button
                  type="button"
                  className="dialog-action-btn"
                  onClick={() =>
                    updateUserStatus(
                      selectedUser.user_id,
                      "blocked"
                    )
                  }
                >
                  <ShieldCheck size={16} />
                  Block User
                </button>
              )}

              <button
                type="button"
                className="dialog-action-btn danger"
                onClick={() =>
                  deleteUser(
                    selectedUser.user_id
                  )
                }
              >
                <Trash2 size={16} />
                Delete User
              </button>
            </div>

            <div className="dialog-warning">
              Email, designation and departments are saved using{" "}
              <strong>Save Details</strong>. Role is saved using{" "}
              <strong>Save Role</strong>. Password is saved using{" "}
              <strong>Save Password</strong>.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdministratorUsers;