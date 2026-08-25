import { useEffect, useRef, useState } from "react";
import {
  Download,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
  Save,
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

  /*
  ============================================================
  FETCH USERS
  ============================================================
  */

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
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to load users."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  /*
  ============================================================
  FILTER USERS
  ============================================================
  */

  const filteredUsers = users.filter((user) => {
    const value = search.trim().toLowerCase();

    return (
      user.full_name?.toLowerCase().includes(value) ||
      user.email?.toLowerCase().includes(value) ||
      String(user.employee_code || "")
        .toLowerCase()
        .includes(value) ||
      user.designation?.toLowerCase().includes(value) ||
      user.department_name?.toLowerCase().includes(value) ||
      user.department_names?.toLowerCase().includes(value) ||
      user.role_name?.toLowerCase().includes(value) ||
      user.status?.toLowerCase().includes(value)
    );
  });

  /*
  ============================================================
  CREATE USER FORM
  ============================================================
  */

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
        `${response.data.message} Default Password: ${
          response.data.default_password || "Valencia@123"
        }`
      );

      setForm(emptyForm);

      await fetchUsers();
    } catch (error) {
      console.error("CREATE USER ERROR:", error);

      setMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to create user."
      );
    } finally {
      setCreating(false);
    }
  };

  /*
  ============================================================
  IMPORT USERS
  ============================================================
  */

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

      const inserted =
        response.data.inserted_users ||
        response.data.imported_users ||
        0;

      const duplicates =
        response.data.duplicate_emails || 0;

      const skipped =
        response.data.skipped_rows || 0;

      setMessage(
        `${
          response.data.message || "Import completed."
        } Imported: ${inserted}, Duplicates: ${duplicates}, Skipped: ${skipped}`
      );

      await fetchUsers();
    } catch (error) {
      console.error("IMPORT USERS ERROR:", error);

      setMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to import users."
      );
    } finally {
      setImporting(false);

      event.target.value = "";
    }
  };

  /*
  ============================================================
  PARSE USER DEPARTMENTS
  ============================================================
  */

  const getUserDepartmentIds = (user) => {
    if (!user) return [];

    if (Array.isArray(user.department_ids)) {
      return user.department_ids
        .map((id) => Number(id))
        .filter(Boolean);
    }

    if (user.department_ids) {
      return String(user.department_ids)
        .split(",")
        .map((id) => Number(id.trim()))
        .filter(Boolean);
    }

    if (user.department_id) {
      return [Number(user.department_id)];
    }

    if (user.department_name) {
      const matchedDepartment = departments.find(
        (department) =>
          String(department.department_name || "")
            .trim()
            .toLowerCase() ===
          String(user.department_name || "")
            .trim()
            .toLowerCase()
      );

      if (matchedDepartment) {
        return [Number(matchedDepartment.department_id)];
      }
    }

    return [];
  };

  /*
  ============================================================
  OPEN USER
  ============================================================
  */

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

  /*
  ============================================================
  CLOSE USER
  ============================================================
  */

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

  /*
  ============================================================
  DEPARTMENT SELECTION
  ============================================================
  */

  const toggleDepartment = (departmentId) => {
    const numericId = Number(departmentId);

    /*
      ADMIN:
      Can manage multiple departments.

      OTHER ROLES:
      Keep only one department.
    */

    if (selectedRole !== "admin") {
      setSelectedDepartmentIds([numericId]);

      return;
    }

    setSelectedDepartmentIds((previous) => {
      if (previous.includes(numericId)) {
        return previous.filter((id) => id !== numericId);
      }

      return [...previous, numericId];
    });
  };

  /*
  ============================================================
  CHANGE ROLE IN UI
  ============================================================
  */

  const handleRoleChange = (roleName) => {
    setSelectedRole(roleName);

    /*
      If changing away from admin,
      only keep one primary department.
    */

    if (
      roleName !== "admin" &&
      selectedDepartmentIds.length > 1
    ) {
      setSelectedDepartmentIds([
        selectedDepartmentIds[0],
      ]);
    }
  };

  /*
  ============================================================
  SAVE USER DETAILS
  ============================================================
  */

  const updateUserDetails = async () => {
    if (!selectedUser) return;

    const cleanEmail = selectedEmail.trim().toLowerCase();

    if (!cleanEmail) {
      setMessage("Please enter an email.");

      return;
    }

    if (!selectedDepartmentIds.length) {
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
        response.data.message ||
          "User details updated successfully."
      );

      await fetchUsers();

      closeUserDialog();
    } catch (error) {
      console.error("UPDATE DETAILS ERROR:", error);

      setMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to update user details."
      );
    } finally {
      setUpdatingDetails(false);
    }
  };

  /*
  ============================================================
  SAVE ROLE
  ============================================================
  */

  const updateUserRole = async () => {
    if (!selectedUser) return;

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
        response.data.message ||
          "User role updated successfully."
      );

      await fetchUsers();

      closeUserDialog();
    } catch (error) {
      console.error("UPDATE ROLE ERROR:", error);

      setMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to update user role."
      );
    } finally {
      setUpdatingRole(false);
    }
  };

  /*
  ============================================================
  SET NEW PASSWORD
  ============================================================
  */

  const updateUserPassword = async () => {
    if (!selectedUser) return;

    if (!newPassword) {
      setMessage("Please enter a new password.");

      return;
    }

    if (newPassword.length < 8) {
      setMessage(
        "Password must contain at least 8 characters."
      );

      return;
    }

    const confirmed = window.confirm(
      `Change password for ${selectedUser.full_name}?`
    );

    if (!confirmed) return;

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
        response.data.message ||
          "User password updated successfully."
      );

      setNewPassword("");
      setShowPassword(false);
    } catch (error) {
      console.error("UPDATE PASSWORD ERROR:", error);

      setMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to update password."
      );
    } finally {
      setUpdatingPassword(false);
    }
  };

  /*
  ============================================================
  STATUS
  ============================================================
  */

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
        response.data.message ||
          "User status updated successfully."
      );

      await fetchUsers();

      closeUserDialog();
    } catch (error) {
      console.error("STATUS ERROR:", error);

      setMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to update user status."
      );
    }
  };

  /*
  ============================================================
  RESET PASSWORD
  ============================================================
  */

  const resetPassword = async (userId) => {
    const confirmReset = window.confirm(
      "Reset this user's password to Valencia@123?"
    );

    if (!confirmReset) return;

    try {
      setMessage("");

      const response = await api.put(
        `/administrator/users/${userId}/reset-password`
      );

      setMessage(
        `${response.data.message} Default Password: ${
          response.data.default_password ||
          "Valencia@123"
        }`
      );

      closeUserDialog();
    } catch (error) {
      console.error("RESET PASSWORD ERROR:", error);

      setMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to reset password."
      );
    }
  };

  /*
  ============================================================
  DELETE USER
  ============================================================
  */

  const deleteUser = async (userId) => {
    const confirmDelete = window.confirm(
      "Delete this user? This will remove access but keep records safe."
    );

    if (!confirmDelete) return;

    try {
      setMessage("");

      const response = await api.delete(
        `/administrator/users/${userId}`
      );

      setMessage(
        response.data.message ||
          "User deleted successfully."
      );

      await fetchUsers();

      closeUserDialog();
    } catch (error) {
      console.error("DELETE USER ERROR:", error);

      setMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to delete user."
      );
    }
  };

  /*
  ============================================================
  EXPORT CSV
  ============================================================
  */

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
            return `"${stringValue.replaceAll(
              '"',
              '""'
            )}"`;
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

  /*
  ============================================================
  DEPARTMENTS TO SHOW
  ============================================================
  */

  const visibleDepartments = departments.filter(
    (department) =>
      fixedDepartments.includes(
        department.department_name
      )
  );

  /*
  ============================================================
  JSX
  ============================================================
  */

  return (
    <div className="users-page">

      {/* ====================================================
          HEADER
      ==================================================== */}

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

      {/* ====================================================
          MESSAGE
      ==================================================== */}

      {message && (
        <div className="projects-message">
          {message}
        </div>
      )}

      {/* ====================================================
          ADD USER
      ==================================================== */}

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

      {/* ====================================================
          SEARCH
      ==================================================== */}

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

      {/* ====================================================
          TABLE
      ==================================================== */}

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

      {/* ====================================================
          CSV HELP
      ==================================================== */}

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
          administrator saves employee details from the
          dialog.
        </p>

      </div>

      {/* ====================================================
          USER POPUP
      ==================================================== */}

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

            {/* HEADER */}

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

            {/* ==================================================
                DETAILS GRID
            ================================================== */}

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

              {/* EMAIL */}

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

              {/* DESIGNATION */}

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

              {/* STATUS */}

              <div className="dialog-field">

                <label>Status</label>

                <p>
                  {selectedUser.status || "-"}
                </p>

              </div>

              {/* SKILLS */}

              <div className="dialog-field">

                <label>Skills</label>

                <p>
                  {selectedUser.skills || "-"}
                </p>

              </div>

              {/* =================================================
                  DEPARTMENTS
              ================================================= */}

              <div className="dialog-field administrator-multi-department-field">

                <label>
                  {selectedRole === "admin"
                    ? "Admin Departments"
                    : "Department"}
                </label>

                <p className="administrator-department-help">

                  {selectedRole === "admin"
                    ? "Select all departments this Admin should manage."
                    : "Select the user's department."}

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

              </div>

              {/* SAVE DETAILS */}

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

            {/* ==================================================
                CHANGE ROLE
            ================================================== */}

            <div className="dialog-role-section">

              <label>
                Change Role
              </label>

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

            {/* ==================================================
                SET NEW PASSWORD
            ================================================== */}

            <div className="administrator-user-password-section">

              <div className="administrator-user-password-title">

                <div>
                  <h3>
                    Set New Password
                  </h3>

                  <p>
                    Existing password cannot be displayed.
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
                  disabled={updatingPassword}
                >
                  <Save size={16} />

                  {updatingPassword
                    ? "Saving..."
                    : "Save Password"}
                </button>

              </div>

            </div>

            {/* ==================================================
                ACTIONS
            ================================================== */}

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

            {/* ==================================================
                INFO
            ================================================== */}

            <div className="dialog-warning">

              Email, designation and departments are
              saved using{" "}
              <strong>Save Details</strong>.

              Role is saved separately using{" "}
              <strong>Save Role</strong>.

              Password is saved separately using{" "}
              <strong>Save Password</strong>.

            </div>

          </div>

        </div>
      )}

    </div>
  );
};

export default AdministratorUsers;