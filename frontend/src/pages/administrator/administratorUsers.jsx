import { useEffect, useMemo, useRef, useState } from "react";
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

const normalizeRole = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

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

  /*
  =========================================================
  SELECTED USER
  =========================================================
  */

  const [selectedUser, setSelectedUser] = useState(null);

  const [selectedRole, setSelectedRole] = useState("");
  const [selectedEmail, setSelectedEmail] = useState("");
  const [selectedDesignation, setSelectedDesignation] = useState("");

  const [
    selectedDepartmentIds,
    setSelectedDepartmentIds,
  ] = useState([]);

  const [updatingRole, setUpdatingRole] =
    useState(false);

  const [updatingDetails, setUpdatingDetails] =
    useState(false);

  /*
  =========================================================
  PASSWORD
  =========================================================
  */

  const [newPassword, setNewPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [
    updatingPassword,
    setUpdatingPassword,
  ] = useState(false);

  /*
  =========================================================
  VISIBLE DEPARTMENTS
  =========================================================
  */

  const visibleDepartments = useMemo(() => {
    return departments.filter((department) =>
      fixedDepartments.includes(
        department.department_name
      )
    );
  }, [departments]);

  /*
  =========================================================
  FETCH USERS
  =========================================================
  */

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setMessage("");

      const [
        usersResponse,
        metaResponse,
      ] = await Promise.all([
        api.get("/administrator/users"),
        api.get("/administrator/users/meta"),
      ]);

      setUsers(
        usersResponse.data.users || []
      );

      setDepartments(
        metaResponse.data.departments || []
      );

      setRoles(
        metaResponse.data.roles || []
      );
    } catch (error) {
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
  =========================================================
  FILTER
  =========================================================
  */

  const filteredUsers = useMemo(() => {
    const value = search
      .trim()
      .toLowerCase();

    return users.filter((user) => {
      return (
        user.full_name
          ?.toLowerCase()
          .includes(value) ||

        user.email
          ?.toLowerCase()
          .includes(value) ||

        user.employee_code
          ?.toLowerCase()
          .includes(value) ||

        user.designation
          ?.toLowerCase()
          .includes(value) ||

        user.department_name
          ?.toLowerCase()
          .includes(value) ||

        user.department_names
          ?.toLowerCase()
          .includes(value) ||

        user.role_name
          ?.toLowerCase()
          .includes(value) ||

        user.status
          ?.toLowerCase()
          .includes(value)
      );
    });
  }, [users, search]);

  /*
  =========================================================
  ADD USER FORM
  =========================================================
  */

  const handleChange = (event) => {
    const { name, value } =
      event.target;

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

      const response = await api.post(
        "/administrator/users",
        form
      );

      setMessage(
        `${response.data.message} Default Password: ${
          response.data.default_password || "Valencia@123"
        }`
      );

      setForm(emptyForm);

      await fetchUsers();
    } catch (error) {
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
  =========================================================
  IMPORT
  =========================================================
  */

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const importUsers = async (event) => {
    const file =
      event.target.files?.[0];

    if (!file) return;

    const formData =
      new FormData();

    formData.append(
      "file",
      file
    );

    try {
      setImporting(true);
      setMessage("");

      const response =
        await api.post(
          "/administrator/users/import",
          formData,
          {
            headers: {
              "Content-Type":
                "multipart/form-data",
            },
          }
        );

      setMessage(
        `${
          response.data.message ||
          "Users imported successfully."
        } Imported: ${
          response.data
            .inserted_users ??
          response.data
            .importedRows ??
          0
        }, Updated: ${
          response.data
            .updated_users ??
          response.data
            .updatedRows ??
          0
        }, Skipped: ${
          response.data
            .skipped_rows ??
          response.data
            .skippedRows ??
          0
        }`
      );

      await fetchUsers();
    } catch (error) {
      setMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to import users."
      );
    } finally {
      setImporting(false);

      if (event.target) {
        event.target.value = "";
      }
    }
  };

  /*
  =========================================================
  PARSE USER DEPARTMENTS
  =========================================================
  */

  const getUserDepartmentIds = (
    user
  ) => {
    if (!user) return [];

    if (
      Array.isArray(
        user.department_ids
      )
    ) {
      return user.department_ids
        .map(Number)
        .filter(Boolean);
    }

    if (
      user.department_ids !==
        undefined &&
      user.department_ids !==
        null &&
      String(
        user.department_ids
      ).trim() !== ""
    ) {
      return String(
        user.department_ids
      )
        .split(",")
        .map((id) =>
          Number(id.trim())
        )
        .filter(Boolean);
    }

    if (user.department_id) {
      return [
        Number(
          user.department_id
        ),
      ].filter(Boolean);
    }

    const department =
      visibleDepartments.find(
        (item) =>
          item.department_name ===
          user.department_name
      );

    if (department) {
      return [
        Number(
          department.department_id
        ),
      ];
    }

    return [];
  };

  /*
  =========================================================
  OPEN USER
  =========================================================
  */

  const openUserDialog = (
    user
  ) => {
    setSelectedUser(user);

    setSelectedRole(
      user.role_name ||
        "employee"
    );

    setSelectedEmail(
      user.email || ""
    );

    setSelectedDesignation(
      user.designation || ""
    );

    setSelectedDepartmentIds(
      getUserDepartmentIds(user)
    );

    setNewPassword("");
    setShowPassword(false);

    setMessage("");
  };

  const closeUserDialog = () => {
    setSelectedUser(null);

    setSelectedRole("");

    setSelectedEmail("");

    setSelectedDesignation("");

    setSelectedDepartmentIds(
      []
    );

    setNewPassword("");

    setShowPassword(false);

    setUpdatingRole(false);
    setUpdatingDetails(false);
    setUpdatingPassword(false);
  };

  /*
  =========================================================
  DEPARTMENT HANDLING
  =========================================================
  */

  const toggleDepartment = (
    departmentId
  ) => {
    const id =
      Number(departmentId);

    /*
      Only Admin role can have
      multiple departments.
    */

    if (
      normalizeRole(
        selectedRole
      ) !== "admin"
    ) {
      setSelectedDepartmentIds([
        id,
      ]);

      return;
    }

    setSelectedDepartmentIds(
      (previous) => {
        if (
          previous.includes(id)
        ) {
          return previous.filter(
            (item) =>
              item !== id
          );
        }

        return [
          ...previous,
          id,
        ];
      }
    );
  };

  const handleSingleDepartmentChange =
    (event) => {
      const value =
        Number(
          event.target.value
        );

      setSelectedDepartmentIds(
        value ? [value] : []
      );
    };

  /*
  =========================================================
  ROLE CHANGE SELECT
  =========================================================
  */

  const handleRoleSelectionChange =
    (event) => {
      const nextRole =
        event.target.value;

      setSelectedRole(
        nextRole
      );

      /*
        If changing away from
        Admin, keep only primary
        department.
      */

      if (
        normalizeRole(
          nextRole
        ) !== "admin"
      ) {
        setSelectedDepartmentIds(
          (previous) =>
            previous.length
              ? [previous[0]]
              : []
        );
      }
    };

  /*
  =========================================================
  SAVE USER DETAILS
  =========================================================
  */

  const updateUserDetails =
    async () => {
      if (!selectedUser) return;

      const cleanEmail =
        selectedEmail
          .trim()
          .toLowerCase();

      if (!cleanEmail) {
        setMessage(
          "Please enter an email address."
        );

        return;
      }

      if (
        !selectedDepartmentIds
          .length
      ) {
        setMessage(
          "Please select at least one department."
        );

        return;
      }

      try {
        setUpdatingDetails(
          true
        );

        setMessage("");

        const response =
          await api.put(
            `/administrator/users/${selectedUser.user_id}/details`,
            {
              email:
                cleanEmail,

              designation:
                selectedDesignation.trim(),

              department_ids:
                selectedDepartmentIds,
            }
          );

        setMessage(
          response.data.message ||
            "User details updated successfully."
        );

        await fetchUsers();

        closeUserDialog();
      } catch (error) {
        setMessage(
          error.response?.data
            ?.error ||
            error.response?.data
              ?.message ||
            "Failed to update user details."
        );
      } finally {
        setUpdatingDetails(
          false
        );
      }
    };

  /*
  =========================================================
  UPDATE ROLE
  =========================================================
  */

  const updateUserRole =
    async () => {
      if (!selectedUser) return;

      try {
        setUpdatingRole(true);
        setMessage("");

        const response =
          await api.put(
            `/administrator/users/${selectedUser.user_id}/role`,
            {
              role_name:
                selectedRole,
            }
          );

        setMessage(
          response.data.message ||
            "User role updated successfully."
        );

        await fetchUsers();

        closeUserDialog();
      } catch (error) {
        setMessage(
          error.response?.data
            ?.error ||
            error.response?.data
              ?.message ||
            "Failed to update user role."
        );
      } finally {
        setUpdatingRole(
          false
        );
      }
    };

  /*
  =========================================================
  SET CUSTOM PASSWORD
  =========================================================
  */

  const updateUserPassword =
    async () => {
      if (!selectedUser) return;

      if (
        newPassword.length < 8
      ) {
        setMessage(
          "Password must be at least 8 characters."
        );

        return;
      }

      try {
        setUpdatingPassword(
          true
        );

        setMessage("");

        const response =
          await api.put(
            `/administrator/users/${selectedUser.user_id}/password`,
            {
              password:
                newPassword,
            }
          );

        setMessage(
          response.data.message ||
            "User password updated successfully."
        );

        setNewPassword("");
        setShowPassword(false);
      } catch (error) {
        setMessage(
          error.response?.data
            ?.error ||
            error.response?.data
              ?.message ||
            "Failed to update user password."
        );
      } finally {
        setUpdatingPassword(
          false
        );
      }
    };

  /*
  =========================================================
  STATUS
  =========================================================
  */

  const updateUserStatus =
    async (
      userId,
      status
    ) => {
      try {
        setMessage("");

        const response =
          await api.put(
            `/administrator/users/${userId}/status`,
            {
              status,
            }
          );

        setMessage(
          response.data.message
        );

        await fetchUsers();

        closeUserDialog();
      } catch (error) {
        setMessage(
          error.response?.data
            ?.error ||
            error.response?.data
              ?.message ||
            "Failed to update user status."
        );
      }
    };

  /*
  =========================================================
  RESET PASSWORD
  =========================================================
  */

  const resetPassword =
    async (userId) => {
      const confirmReset =
        window.confirm(
          "Reset this user's password to Valencia@123?"
        );

      if (!confirmReset) return;

      try {
        setMessage("");

        const response =
          await api.put(
            `/administrator/users/${userId}/reset-password`
          );

        setMessage(
          `${
            response.data.message
          } Default Password: ${
            response.data
              .default_password ||
            "Valencia@123"
          }`
        );

        closeUserDialog();
      } catch (error) {
        setMessage(
          error.response?.data
            ?.error ||
            error.response?.data
              ?.message ||
            "Failed to reset password."
        );
      }
    };

  /*
  =========================================================
  DELETE
  =========================================================
  */

  const deleteUser = async (
    userId
  ) => {
    const confirmDelete =
      window.confirm(
        "Delete this user permanently?"
      );

    if (!confirmDelete) return;

    try {
      setMessage("");

      const response =
        await api.delete(
          `/administrator/users/${userId}`
        );

      setMessage(
        response.data.message
      );

      await fetchUsers();

      closeUserDialog();
    } catch (error) {
      setMessage(
        error.response?.data?.error ||
          error.response?.data
            ?.message ||
          "Failed to delete user."
      );
    }
  };

  /*
  =========================================================
  EXPORT CSV
  =========================================================
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

    const rows =
      filteredUsers.map((user) =>
        headers
          .map((header) => {
            let value =
              user[header] || "";

            if (
              header ===
                "department_names" &&
              !value
            ) {
              value =
                user.department_name ||
                "";
            }

            const stringValue =
              String(value);

            if (
              stringValue.includes(
                ","
              ) ||
              stringValue.includes(
                '"'
              ) ||
              stringValue.includes(
                "\n"
              )
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

    const blob =
      new Blob(
        [csvContent],
        {
          type: "text/csv;charset=utf-8;",
        }
      );

    const url =
      window.URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        "a"
      );

    link.href = url;

    link.setAttribute(
      "download",
      "valencia-rms-users.csv"
    );

    document.body.appendChild(
      link
    );

    link.click();
    link.remove();

    window.URL.revokeObjectURL(
      url
    );
  };

  /*
  =========================================================
  USER DEPARTMENT DISPLAY
  =========================================================
  */

  const getDepartmentDisplay = (
    user
  ) => {
    return (
      user.department_names ||
      user.department_name ||
      "-"
    );
  };

  /*
  =========================================================
  JSX
  =========================================================
  */

  return (
    <div className="users-page">
      {/* HEADER */}

      <div className="administrator-users-header">
        <div className="administrator-users-heading">
          <h1>Users</h1>

          <p>
            Add, import and manage company users.
          </p>
        </div>

        <div className="administrator-users-header-actions">
          <button
            type="button"
            className="administrator-users-header-btn"
            onClick={fetchUsers}
            disabled={loading}
          >
            <RefreshCw
              size={14}
              className={
                loading
                  ? "administrator-spin"
                  : ""
              }
            />

            <span>
              Refresh
            </span>
          </button>

          <button
            type="button"
            className="administrator-users-header-btn"
            onClick={
              exportUsersCsv
            }
          >
            <Download size={14} />

            <span>
              Export CSV
            </span>
          </button>

          <button
            type="button"
            className="administrator-users-header-btn administrator-users-import-btn"
            onClick={
              handleImportClick
            }
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

      {/* MESSAGE */}

      {message && (
        <div className="administrator-users-message">
          {message}
        </div>
      )}

      {/* ADD SINGLE USER */}

      <section className="administrator-add-user-card">
        <div className="administrator-add-user-heading">
          <h2>
            Add Single User
          </h2>

          <p>
            New users receive
            default password:
            Valencia@123
          </p>
        </div>

        <form
          className="administrator-user-form-grid"
          onSubmit={createUser}
        >
          <div className="administrator-form-field">
            <label>
              Employee Code
            </label>

            <input
              value="Auto generated"
              disabled
            />
          </div>

          <div className="administrator-form-field">
            <label>
              Full Name *
            </label>

            <input
              name="full_name"
              value={
                form.full_name
              }
              onChange={
                handleChange
              }
              placeholder="Employee name"
              required
            />
          </div>

          <div className="administrator-form-field">
            <label>
              Email *
            </label>

            <input
              name="email"
              type="email"
              value={form.email}
              onChange={
                handleChange
              }
              placeholder="name@valencianutrition.com"
              required
            />
          </div>

          <div className="administrator-form-field">
            <label>
              Phone
            </label>

            <input
              name="phone"
              value={form.phone}
              onChange={
                handleChange
              }
              placeholder="Phone number"
            />
          </div>

          <div className="administrator-form-field">
            <label>
              Designation
            </label>

            <input
              name="designation"
              value={
                form.designation
              }
              onChange={
                handleChange
              }
              placeholder="Designation"
            />
          </div>

          <div className="administrator-form-field">
            <label>
              Department
            </label>

            <select
              name="department_name"
              value={
                form.department_name
              }
              onChange={
                handleChange
              }
            >
              <option value="">
                Select department
              </option>

              {fixedDepartments.map(
                (department) => (
                  <option
                    key={
                      department
                    }
                    value={
                      department
                    }
                  >
                    {
                      department
                    }
                  </option>
                )
              )}
            </select>
          </div>

          <div className="administrator-form-field">
            <label>
              Role
            </label>

            <select
              name="role_name"
              value={
                form.role_name
              }
              onChange={
                handleChange
              }
            >
              {roles.map(
                (role) => (
                  <option
                    key={
                      role.role_id
                    }
                    value={
                      role.role_name
                    }
                  >
                    {
                      role.role_name
                    }
                  </option>
                )
              )}
            </select>
          </div>

          <div className="administrator-form-submit">
            <button
              type="submit"
              className="administrator-primary-btn"
              disabled={creating}
            >
              <UserPlus
                size={16}
              />

              {creating
                ? "Creating..."
                : "Create User"}
            </button>
          </div>
        </form>
      </section>

      {/* SEARCH */}

      <div className="administrator-users-toolbar">
        <div className="administrator-users-search">
          <Search size={17} />

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search users, email, role or department..."
          />
        </div>

        <span className="administrator-total-users">
          Total:{" "}
          {filteredUsers.length}
        </span>
      </div>

      {/* TABLE */}

      <div className="administrator-users-table-card">
        {loading ? (
          <div className="administrator-users-loading">
            Loading users...
          </div>
        ) : (
          <table className="administrator-users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>
                  Department
                </th>
                <th>
                  Designation
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredUsers.length >
              0 ? (
                filteredUsers.map(
                  (user) => (
                    <tr
                      key={
                        user.user_id
                      }
                      onClick={() =>
                        openUserDialog(
                          user
                        )
                      }
                    >
                      <td>
                        <div className="administrator-user-cell">
                          <div className="administrator-user-avatar">
                            <Users
                              size={
                                17
                              }
                            />
                          </div>

                          <div className="administrator-user-main">
                            <strong>
                              {
                                user.full_name
                              }
                            </strong>

                            <span>
                              {
                                user.email
                              }
                            </span>

                            <small>
                              {user.employee_code ||
                                "Code not generated"}
                            </small>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="administrator-role-pill">
                          {
                            user.role_name
                          }
                        </span>
                      </td>

                      <td>
                        <span className="administrator-department-text">
                          {getDepartmentDisplay(
                            user
                          )}
                        </span>
                      </td>

                      <td>
                        {user.designation ||
                          "-"}
                      </td>
                    </tr>
                  )
                )
              ) : (
                <tr>
                  <td
                    colSpan="4"
                    className="administrator-users-empty"
                  >
                    No users
                    found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* USER DIALOG */}

      {selectedUser && (
        <div
          className="administrator-user-dialog-backdrop"
          onMouseDown={
            closeUserDialog
          }
        >
          <div
            className="administrator-user-dialog"
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            {/* DIALOG HEADER */}

            <div className="administrator-user-dialog-header">
              <div>
                <h2>
                  {
                    selectedUser.full_name
                  }
                </h2>

                <p>
                  Edit user
                  information,
                  departments,
                  role and
                  password.
                </p>
              </div>

              <button
                type="button"
                className="administrator-dialog-close"
                onClick={
                  closeUserDialog
                }
              >
                <X size={19} />
              </button>
            </div>

            <div className="administrator-user-dialog-body">
              {/* BASIC INFORMATION */}

              <section className="administrator-dialog-section">
                <div className="administrator-dialog-section-heading">
                  <h3>
                    User Details
                  </h3>

                  <p>
                    Update email,
                    designation
                    and department
                    access.
                  </p>
                </div>

                <div className="administrator-user-details-grid">
                  <div className="administrator-dialog-field">
                    <label>
                      Employee
                      Code
                    </label>

                    <div className="administrator-static-field">
                      {selectedUser.employee_code ||
                        "Not generated"}
                    </div>
                  </div>

                  <div className="administrator-dialog-field">
                    <label>
                      Current
                      Role
                    </label>

                    <div className="administrator-static-field">
                      {selectedUser.role_name ||
                        "-"}
                    </div>
                  </div>

                  <div className="administrator-dialog-field administrator-dialog-field-full">
                    <label>
                      Email
                    </label>

                    <input
                      type="email"
                      value={
                        selectedEmail
                      }
                      onChange={(
                        event
                      ) =>
                        setSelectedEmail(
                          event.target
                            .value
                        )
                      }
                      placeholder="Enter email"
                    />
                  </div>

                  <div className="administrator-dialog-field">
                    <label>
                      Designation
                    </label>

                    <input
                      value={
                        selectedDesignation
                      }
                      onChange={(
                        event
                      ) =>
                        setSelectedDesignation(
                          event.target
                            .value
                        )
                      }
                      placeholder="Enter designation"
                    />
                  </div>

                  <div className="administrator-dialog-field">
                    <label>
                      Status
                    </label>

                    <div className="administrator-static-field">
                      {selectedUser.status ||
                        "-"}
                    </div>
                  </div>
                </div>

                {/* ADMIN MULTIPLE DEPARTMENTS */}

                {normalizeRole(
                  selectedRole
                ) === "admin" ? (
                  <div className="admin-departments-section">
                    <div className="admin-departments-header">
                      <h4>
                        Admin
                        Departments
                      </h4>

                      <p>
                        Select all
                        departments
                        this Admin
                        should
                        manage.
                      </p>
                    </div>

                    <div className="admin-departments-grid">
                      {visibleDepartments.map(
                        (
                          department
                        ) => {
                          const departmentId =
                            Number(
                              department.department_id
                            );

                          const isChecked =
                            selectedDepartmentIds.includes(
                              departmentId
                            );

                          return (
                            <label
                              key={
                                department.department_id
                              }
                              className={`admin-department-card ${
                                isChecked
                                  ? "selected"
                                  : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={
                                  isChecked
                                }
                                onChange={() =>
                                  toggleDepartment(
                                    departmentId
                                  )
                                }
                              />

                              <span className="admin-department-checkmark">
                                {isChecked
                                  ? "✓"
                                  : ""}
                              </span>

                              <span className="admin-department-name">
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
                ) : (
                  /* NORMAL USER SINGLE DEPARTMENT */

                  <div className="administrator-single-department-section">
                    <label>
                      Department
                    </label>

                    <select
                      value={
                        selectedDepartmentIds[
                          0
                        ] || ""
                      }
                      onChange={
                        handleSingleDepartmentChange
                      }
                    >
                      <option value="">
                        Select
                        department
                      </option>

                      {visibleDepartments.map(
                        (
                          department
                        ) => (
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
                  </div>
                )}

                <div className="administrator-dialog-save-row">
                  <button
                    type="button"
                    className="administrator-primary-btn"
                    onClick={
                      updateUserDetails
                    }
                    disabled={
                      updatingDetails
                    }
                  >
                    <Save
                      size={16}
                    />

                    {updatingDetails
                      ? "Saving..."
                      : "Save Details"}
                  </button>
                </div>
              </section>

              {/* ROLE */}

              <section className="administrator-dialog-section">
                <div className="administrator-dialog-section-heading">
                  <h3>
                    Change Role
                  </h3>

                  <p>
                    Select the
                    dashboard role
                    this user
                    should have.
                  </p>
                </div>

                <div className="administrator-role-control">
                  <select
                    value={
                      selectedRole
                    }
                    onChange={
                      handleRoleSelectionChange
                    }
                  >
                    {roles.map(
                      (role) => (
                        <option
                          key={
                            role.role_id
                          }
                          value={
                            role.role_name
                          }
                        >
                          {
                            role.role_name
                          }
                        </option>
                      )
                    )}
                  </select>

                  <button
                    type="button"
                    className="administrator-primary-btn"
                    onClick={
                      updateUserRole
                    }
                    disabled={
                      updatingRole
                    }
                  >
                    <Save
                      size={16}
                    />

                    {updatingRole
                      ? "Saving..."
                      : "Save Role"}
                  </button>
                </div>
              </section>

              {/* PASSWORD */}

              <section className="administrator-dialog-section">
                <div className="administrator-dialog-section-heading">
                  <h3>
                    Set New
                    Password
                  </h3>

                  <p>
                    The existing
                    password
                    cannot be
                    viewed. You
                    can set a new
                    password for
                    this user.
                  </p>
                </div>

                <div className="administrator-password-control">
                  <div className="administrator-password-input-wrap">
                    <input
                      type={
                        showPassword
                          ? "text"
                          : "password"
                      }
                      value={
                        newPassword
                      }
                      onChange={(
                        event
                      ) =>
                        setNewPassword(
                          event.target
                            .value
                        )
                      }
                      placeholder="Minimum 8 characters"
                    />

                    <button
                      type="button"
                      className="administrator-password-eye"
                      onClick={() =>
                        setShowPassword(
                          (
                            previous
                          ) =>
                            !previous
                        )
                      }
                    >
                      {showPassword ? (
                        <EyeOff
                          size={
                            18
                          }
                        />
                      ) : (
                        <Eye
                          size={
                            18
                          }
                        />
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    className="administrator-primary-btn"
                    onClick={
                      updateUserPassword
                    }
                    disabled={
                      updatingPassword ||
                      newPassword.length <
                        8
                    }
                  >
                    <Lock
                      size={16}
                    />

                    {updatingPassword
                      ? "Updating..."
                      : "Set Password"}
                  </button>
                </div>
              </section>

              {/* ACCOUNT ACTIONS */}

              <section className="administrator-dialog-section">
                <div className="administrator-dialog-section-heading">
                  <h3>
                    Account
                    Actions
                  </h3>

                  <p>
                    Reset,
                    block/unblock
                    or remove this
                    account.
                  </p>
                </div>

                <div className="administrator-dialog-actions">
                  <button
                    type="button"
                    className="administrator-action-btn"
                    onClick={() =>
                      resetPassword(
                        selectedUser.user_id
                      )
                    }
                  >
                    <Lock
                      size={16}
                    />

                    Reset to
                    Default
                  </button>

                  {selectedUser.status ===
                  "blocked" ? (
                    <button
                      type="button"
                      className="administrator-action-btn"
                      onClick={() =>
                        updateUserStatus(
                          selectedUser.user_id,
                          "active"
                        )
                      }
                    >
                      <ShieldCheck
                        size={
                          16
                        }
                      />

                      Unblock
                      User
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="administrator-action-btn"
                      onClick={() =>
                        updateUserStatus(
                          selectedUser.user_id,
                          "blocked"
                        )
                      }
                    >
                      <ShieldCheck
                        size={
                          16
                        }
                      />

                      Block User
                    </button>
                  )}

                  <button
                    type="button"
                    className="administrator-action-btn danger"
                    onClick={() =>
                      deleteUser(
                        selectedUser.user_id
                      )
                    }
                  >
                    <Trash2
                      size={16}
                    />

                    Delete User
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdministratorUsers;