import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MinusCircle,
  Plus,
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

const emptyForm = {
  employee_code: "",
  full_name: "",
  email: "",
  phone: "",
  designation: "",
  department_name: "",
  role_name: "employee",
};

const emptyDepartmentForm = {
  department_name: "",
  description: "",
};

const normalizeRole = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const LEAVE_TYPES = [
  {
    value: "sick",
    label: "Sick Leave",
  },
  {
    value: "casual",
    label: "Casual Leave",
  },
  {
    value: "mandatory",
    label: "Privileged Leave",
  },
  {
    value: "festival",
    label: "Festival Leave",
  },
];

const AdministratorUsers = () => {
  const fileInputRef = useRef(null);

  const [users, setUsers] = useState([]);
const [departments, setDepartments] = useState([]);
const [divisions, setDivisions] = useState([]);
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
  const [selectedDivisionIds, setSelectedDivisionIds] = useState([]);

  const [updatingRole, setUpdatingRole] = useState(false);
  const [updatingDetails, setUpdatingDetails] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const [showExtraLeaveModal, setShowExtraLeaveModal] = useState(false);
  const [extraLeaveType, setExtraLeaveType] = useState("");
  const [extraLeaveDays, setExtraLeaveDays] = useState("");
  const [savingExtraLeave, setSavingExtraLeave] = useState(false);

  const [showReduceLeaveModal, setShowReduceLeaveModal] = useState(false);
  const [leaveBalances, setLeaveBalances] = useState(null);
  const [loadingLeaveBalances, setLoadingLeaveBalances] = useState(false);

  const [showReduceLeaveForm, setShowReduceLeaveForm] = useState(false);
  const [reduceLeaveType, setReduceLeaveType] = useState("");
  const [reduceDurationType, setReduceDurationType] = useState("full_day");
  const [reduceHalfDaySession, setReduceHalfDaySession] =
    useState("first_half");
  const [reduceStartDate, setReduceStartDate] = useState("");
  const [reduceEndDate, setReduceEndDate] = useState("");
  const [savingReduceLeave, setSavingReduceLeave] = useState(false);

  const [showMailRecipientsModal, setShowMailRecipientsModal] =
    useState(false);

  const [mailRecipientUsers, setMailRecipientUsers] =
    useState([]);

  const [leaveMailRecipientIds, setLeaveMailRecipientIds] =
    useState([]);

  const [
    fieldVisitMailRecipientIds,
    setFieldVisitMailRecipientIds,
  ] = useState([]);

  const [loadingMailRecipients, setLoadingMailRecipients] =
    useState(false);

  const [savingMailRecipients, setSavingMailRecipients] =
    useState(false);

  const [showAddDepartment, setShowAddDepartment] = useState(false);

  const [departmentForm, setDepartmentForm] = useState(
    emptyDepartmentForm
  );

  const [creatingDepartment, setCreatingDepartment] = useState(false);
  const [showDivisionManager, setShowDivisionManager] = useState(false);
const [newDivisionName, setNewDivisionName] = useState("");
const [creatingDivision, setCreatingDivision] = useState(false);
const [updatingDivisionId, setUpdatingDivisionId] = useState(null);

  const visibleDepartments = useMemo(() => {
    return [...departments].sort((a, b) =>
      String(a.department_name || "").localeCompare(
        String(b.department_name || "")
      )
    );
  }, [departments]);
  const visibleDivisions = useMemo(() => {
  return [...divisions].sort((a, b) => {
    const activeDifference =
      Number(b.is_active) - Number(a.is_active);

    if (activeDifference !== 0) {
      return activeDifference;
    }

    return String(a.division_name || "").localeCompare(
      String(b.division_name || "")
    );
  });
}, [divisions]);

const activeDivisions = useMemo(() => {
  return visibleDivisions.filter(
    (division) => Number(division.is_active) === 1
  );
}, [visibleDivisions]);

  const fetchUsers = async () => {
    try {
      setLoading(true);

      const [usersResponse, metaResponse] = await Promise.all([
        api.get("/administrator/users"),
        api.get("/administrator/users/meta"),
      ]);

      setUsers(usersResponse.data.users || []);
setDepartments(metaResponse.data.departments || []);
setDivisions(metaResponse.data.divisions || []);
setRoles(metaResponse.data.roles || []);

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

  const filteredUsers = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) return users;

    return users.filter((user) => {
      return (
        user.full_name?.toLowerCase().includes(value) ||
        user.email?.toLowerCase().includes(value) ||
        user.employee_code?.toLowerCase().includes(value) ||
        user.designation?.toLowerCase().includes(value) ||
        user.department_name?.toLowerCase().includes(value) ||
        user.department_names?.toLowerCase().includes(value) ||
user.division_names?.toLowerCase().includes(value) ||
user.role_name?.toLowerCase().includes(value) ||
        user.status?.toLowerCase().includes(value)
      );
    });
  }, [users, search]);

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
        `${
          response.data.message || "User created successfully."
        } Default Password: ${
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

  const openAddDepartmentModal = () => {
    setDepartmentForm(emptyDepartmentForm);
    setShowAddDepartment(true);
  };

  const closeAddDepartmentModal = () => {
    if (creatingDepartment) return;

    setDepartmentForm(emptyDepartmentForm);
    setShowAddDepartment(false);
  };

  const handleDepartmentFormChange = (event) => {
    const { name, value } = event.target;

    setDepartmentForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const createDepartment = async (event) => {
    event.preventDefault();

    const departmentName = departmentForm.department_name.trim();

    if (!departmentName) {
      setMessage("Department name is required.");
      return;
    }

    try {
      setCreatingDepartment(true);
      setMessage("");

      const response = await api.post("/administrator/departments", {
        department_name: departmentName,
        description: departmentForm.description.trim(),
      });

      const createdDepartment = response.data.department;

      setMessage(
        response.data.message || "Department added successfully."
      );

      setShowAddDepartment(false);
      setDepartmentForm(emptyDepartmentForm);

      const metaResponse = await api.get("/administrator/users/meta");

      setDepartments(metaResponse.data.departments || []);

      if (createdDepartment?.department_name) {
        setForm((previous) => ({
          ...previous,
          department_name: createdDepartment.department_name,
        }));
      }
    } catch (error) {
      setMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to add department."
      );
    } finally {
      setCreatingDepartment(false);
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

      setMessage(
        `${
          response.data.message || "Users imported successfully."
        } Imported: ${
          response.data.inserted_users ??
          response.data.importedRows ??
          0
        }, Updated: ${
          response.data.updated_users ??
          response.data.updatedRows ??
          0
        }, Skipped: ${
          response.data.skipped_rows ??
          response.data.skippedRows ??
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

  const getUserDepartmentIds = (user) => {
    if (!user) return [];

    if (Array.isArray(user.department_ids)) {
      return user.department_ids
        .map(Number)
        .filter(Boolean);
    }

    if (
      user.department_ids !== undefined &&
      user.department_ids !== null &&
      String(user.department_ids).trim() !== ""
    ) {
      return String(user.department_ids)
        .split(",")
        .map((id) => Number(id.trim()))
        .filter(Boolean);
    }

    if (user.department_id) {
      return [Number(user.department_id)].filter(Boolean);
    }

    const department = visibleDepartments.find(
      (item) =>
        item.department_name ===
        user.department_name
    );

    if (department) {
      return [
        Number(department.department_id),
      ];
    }

    return [];
  };

  const getUserDivisionIds = (user) => {
  if (!user) return [];

  if (Array.isArray(user.division_ids)) {
    return user.division_ids
      .map(Number)
      .filter(Boolean);
  }

  if (
    user.division_ids !== undefined &&
    user.division_ids !== null &&
    String(user.division_ids).trim() !== ""
  ) {
    return String(user.division_ids)
      .split(",")
      .map((id) => Number(id.trim()))
      .filter(Boolean);
  }

  return [];
};

  const openUserDialog = (user) => {
    setSelectedUser(user);

    setSelectedRole(
      user.role_name || "employee"
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

    setSelectedDivisionIds(
  getUserDivisionIds(user)
);

    setNewPassword("");
    setShowPassword(false);

    setShowExtraLeaveModal(false);
    setExtraLeaveType("");
    setExtraLeaveDays("");

    setShowReduceLeaveModal(false);
    setLeaveBalances(null);
    setShowReduceLeaveForm(false);
    setReduceLeaveType("");
    setReduceDurationType("full_day");
    setReduceHalfDaySession("first_half");
    setReduceStartDate("");
    setReduceEndDate("");

    setShowMailRecipientsModal(false);
    setMailRecipientUsers([]);
    setLeaveMailRecipientIds([]);
    setFieldVisitMailRecipientIds([]);
    setLoadingMailRecipients(false);
    setSavingMailRecipients(false);

    setMessage("");
  };

  const closeUserDialog = () => {
    setSelectedUser(null);

    setSelectedRole("");
    setSelectedEmail("");
    setSelectedDesignation("");

    setSelectedDepartmentIds([]);

    setSelectedDivisionIds([]);

    setNewPassword("");
    setShowPassword(false);

    setShowExtraLeaveModal(false);
    setExtraLeaveType("");
    setExtraLeaveDays("");
    setSavingExtraLeave(false);

    setShowReduceLeaveModal(false);
    setLeaveBalances(null);
    setLoadingLeaveBalances(false);

    setShowReduceLeaveForm(false);
    setReduceLeaveType("");
    setReduceDurationType("full_day");
    setReduceHalfDaySession("first_half");
    setReduceStartDate("");
    setReduceEndDate("");
    setSavingReduceLeave(false);

    setShowMailRecipientsModal(false);
    setMailRecipientUsers([]);
    setLeaveMailRecipientIds([]);
    setFieldVisitMailRecipientIds([]);
    setLoadingMailRecipients(false);
    setSavingMailRecipients(false);

    setUpdatingRole(false);
    setUpdatingDetails(false);
    setUpdatingPassword(false);
  };

  const getIndiaToday = () => {
    const parts =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone:
            "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }
      ).formatToParts(
        new Date()
      );

    const values = {};

    parts.forEach((part) => {
      values[part.type] =
        part.value;
    });

    return `${values.year}-${values.month}-${values.day}`;
  };

  const calculateReductionDays = () => {
    if (!reduceStartDate) {
      return 0;
    }

    if (
      reduceDurationType ===
      "half_day"
    ) {
      return 0.5;
    }

    if (!reduceEndDate) {
      return 0;
    }

    const startParts =
      reduceStartDate
        .split("-")
        .map(Number);

    const endParts =
      reduceEndDate
        .split("-")
        .map(Number);

    if (
      startParts.length !== 3 ||
      endParts.length !== 3
    ) {
      return 0;
    }

    const start =
      Date.UTC(
        startParts[0],
        startParts[1] - 1,
        startParts[2]
      );

    const end =
      Date.UTC(
        endParts[0],
        endParts[1] - 1,
        endParts[2]
      );

    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      end < start
    ) {
      return 0;
    }

    return (
      Math.floor(
        (end - start) /
          (
            24 *
            60 *
            60 *
            1000
          )
      ) + 1
    );
  };

  const openExtraLeaveModal = () => {
    if (!selectedUser) return;

    setExtraLeaveType("");
    setExtraLeaveDays("");

    setShowExtraLeaveModal(true);
  };

  const closeExtraLeaveModal = () => {
    if (savingExtraLeave) {
      return;
    }

    setShowExtraLeaveModal(false);
    setExtraLeaveType("");
    setExtraLeaveDays("");
  };

  const addExtraLeave = async () => {
    if (!selectedUser) {
      return;
    }

    if (!extraLeaveType) {
      setMessage(
        "Please select a leave type."
      );

      return;
    }

    const days =
      Number(extraLeaveDays);

    if (
      !Number.isFinite(days) ||
      days <= 0
    ) {
      setMessage(
        "Please enter valid extra leave days."
      );

      return;
    }

    try {
      setSavingExtraLeave(true);
      setMessage("");

      const response =
        await api.post(
          `/administrator/users/${selectedUser.user_id}/leave-extra`,
          {
            leave_type:
              extraLeaveType,

            adjustment_days:
              days,
          }
        );

      setMessage(
        response.data.message ||
          "Extra leave added successfully."
      );

      setShowExtraLeaveModal(false);
      setExtraLeaveType("");
      setExtraLeaveDays("");

      if (
        response.data.balances
      ) {
        setLeaveBalances(
          response.data.balances
        );
      }
    } catch (error) {
      setMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to add extra leave."
      );
    } finally {
      setSavingExtraLeave(false);
    }
  };

  const fetchSelectedUserLeaveBalances =
    async () => {
      if (!selectedUser) {
        return null;
      }

      try {
        setLoadingLeaveBalances(true);
        setMessage("");

        const response =
          await api.get(
            `/administrator/users/${selectedUser.user_id}/leave-balances`
          );

        const balances =
          response.data.balances ||
          {};

        setLeaveBalances(
          balances
        );

        return balances;
      } catch (error) {
        setMessage(
          error.response?.data?.error ||
            error.response?.data?.message ||
            "Failed to load leave balances."
        );

        return null;
      } finally {
        setLoadingLeaveBalances(false);
      }
    };

  const openReduceLeaveModal =
    async () => {
      if (!selectedUser) {
        return;
      }

      setShowReduceLeaveModal(true);

      setShowReduceLeaveForm(false);
      setReduceLeaveType("");
      setReduceDurationType("full_day");
      setReduceHalfDaySession(
        "first_half"
      );
      setReduceStartDate("");
      setReduceEndDate("");

      await fetchSelectedUserLeaveBalances();
    };

  const closeReduceLeaveModal = () => {
    if (
      savingReduceLeave ||
      loadingLeaveBalances
    ) {
      return;
    }

    setShowReduceLeaveModal(false);
    setShowReduceLeaveForm(false);

    setReduceLeaveType("");
    setReduceDurationType("full_day");
    setReduceHalfDaySession(
      "first_half"
    );
    setReduceStartDate("");
    setReduceEndDate("");
  };

  const openReduceLeaveFormForType =
    (leaveType) => {
      setReduceLeaveType(
        leaveType
      );

      setReduceDurationType(
        "full_day"
      );

      setReduceHalfDaySession(
        "first_half"
      );

      setReduceStartDate("");
      setReduceEndDate("");

      setShowReduceLeaveForm(true);
    };

  const closeReduceLeaveForm = () => {
    if (savingReduceLeave) {
      return;
    }

    setShowReduceLeaveForm(false);
    setReduceLeaveType("");
    setReduceDurationType("full_day");
    setReduceHalfDaySession(
      "first_half"
    );
    setReduceStartDate("");
    setReduceEndDate("");
  };

  const openMailRecipientsModal =
    async () => {
      if (!selectedUser) {
        return;
      }

      try {
        setLoadingMailRecipients(true);
        setMessage("");

        const response =
          await api.get(
            `/administrator/users/${selectedUser.user_id}/mail-recipients`
          );

        setMailRecipientUsers(
          response.data.available_users ||
            []
        );

        setLeaveMailRecipientIds(
          (
            response.data.leave
              ?.recipient_user_ids ||
            []
          ).map(Number)
        );

        setFieldVisitMailRecipientIds(
          (
            response.data.field_visit
              ?.recipient_user_ids ||
            []
          ).map(Number)
        );

        setShowMailRecipientsModal(
          true
        );
      } catch (error) {
        setMessage(
          error.response?.data?.error ||
            error.response?.data?.message ||
            "Failed to load mail recipients."
        );
      } finally {
        setLoadingMailRecipients(false);
      }
    };

  const closeMailRecipientsModal =
    () => {
      if (
        savingMailRecipients ||
        loadingMailRecipients
      ) {
        return;
      }

      setShowMailRecipientsModal(false);
      setMailRecipientUsers([]);
      setLeaveMailRecipientIds([]);
      setFieldVisitMailRecipientIds([]);
    };

  const toggleLeaveMailRecipient =
    (userId) => {
      const id =
        Number(userId);

      setLeaveMailRecipientIds(
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

  const toggleFieldVisitMailRecipient =
    (userId) => {
      const id =
        Number(userId);

      setFieldVisitMailRecipientIds(
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

  const saveMailRecipients =
    async () => {
      if (!selectedUser) {
        return;
      }

      if (
        leaveMailRecipientIds.length ===
        0
      ) {
        setMessage(
          "Please select at least one Leave Application mail recipient."
        );

        return;
      }

      if (
        fieldVisitMailRecipientIds.length ===
        0
      ) {
        setMessage(
          "Please select at least one Field Visit mail recipient."
        );

        return;
      }

      try {
        setSavingMailRecipients(true);
        setMessage("");

        const response =
          await api.put(
            `/administrator/users/${selectedUser.user_id}/mail-recipients`,
            {
              leave_recipient_user_ids:
                leaveMailRecipientIds,

              field_visit_recipient_user_ids:
                fieldVisitMailRecipientIds,
            }
          );

        setMessage(
          response.data.message ||
            "Mail recipients updated successfully."
        );

        setShowMailRecipientsModal(false);
      } catch (error) {
        setMessage(
          error.response?.data?.error ||
            error.response?.data?.message ||
            "Failed to update mail recipients."
        );
      } finally {
        setSavingMailRecipients(false);
      }
    };

  const saveReducedLeave =
    async () => {
      if (
        !selectedUser ||
        !reduceLeaveType
      ) {
        return;
      }

      if (!reduceStartDate) {
        setMessage(
          "Please select the From Date."
        );

        return;
      }

      const finalEndDate =
        reduceDurationType ===
        "half_day"
          ? reduceStartDate
          : reduceEndDate;

      if (
        reduceDurationType ===
          "full_day" &&
        !finalEndDate
      ) {
        setMessage(
          "Please select the To Date."
        );

        return;
      }

      const leaveDays =
        calculateReductionDays();

      if (
        leaveDays <= 0
      ) {
        setMessage(
          "Please select valid leave dates."
        );

        return;
      }

      try {
        setSavingReduceLeave(true);
        setMessage("");

        const response =
          await api.post(
            `/administrator/users/${selectedUser.user_id}/leave-reduction`,
            {
              leave_type:
                reduceLeaveType,

              duration_type:
                reduceDurationType,

              half_day_session:
                reduceDurationType ===
                "half_day"
                  ? reduceHalfDaySession
                  : null,

              start_date:
                reduceStartDate,

              end_date:
                finalEndDate,
            }
          );

        setMessage(
          response.data.message ||
            "Leave reduced successfully."
        );

        if (
          response.data.balances
        ) {
          setLeaveBalances(
            response.data.balances
          );
        } else {
          await fetchSelectedUserLeaveBalances();
        }

        setShowReduceLeaveForm(false);
        setReduceLeaveType("");
        setReduceDurationType(
          "full_day"
        );
        setReduceHalfDaySession(
          "first_half"
        );
        setReduceStartDate("");
        setReduceEndDate("");
      } catch (error) {
        setMessage(
          error.response?.data?.error ||
            error.response?.data?.message ||
            "Failed to reduce leave."
        );
      } finally {
        setSavingReduceLeave(false);
      }
    };

  const toggleDepartment = (
    departmentId
  ) => {
    const id =
      Number(departmentId);

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

  const toggleDivision = (divisionId) => {
  const id = Number(divisionId);

  setSelectedDivisionIds((previous) => {
    if (previous.includes(id)) {
      return previous.filter(
        (item) => item !== id
      );
    }

    return [
      ...previous,
      id,
    ];
  });
};


const openDivisionManager = async () => {
  try {
    setMessage("");

    const response = await api.get(
      "/administrator/divisions"
    );

    setDivisions(
      response.data.divisions || []
    );

    setNewDivisionName("");
    setShowDivisionManager(true);
  } catch (error) {
    setMessage(
      error.response?.data?.error ||
        error.response?.data?.message ||
        "Failed to load divisions."
    );
  }
};


const closeDivisionManager = () => {
  if (
    creatingDivision ||
    updatingDivisionId
  ) {
    return;
  }

  setNewDivisionName("");
  setShowDivisionManager(false);
};


const createDivision = async (event) => {
  event.preventDefault();

  const divisionName =
    newDivisionName.trim();

  if (!divisionName) {
    setMessage(
      "Division name is required."
    );
    return;
  }

  try {
    setCreatingDivision(true);
    setMessage("");

    const response = await api.post(
      "/administrator/divisions",
      {
        division_name: divisionName,
      }
    );

    setMessage(
      response.data.message ||
        "Division added successfully."
    );

    const divisionsResponse =
      await api.get(
        "/administrator/divisions"
      );

    setDivisions(
      divisionsResponse.data.divisions ||
        []
    );

    setNewDivisionName("");
  } catch (error) {
    setMessage(
      error.response?.data?.error ||
        error.response?.data?.message ||
        "Failed to add Division."
    );
  } finally {
    setCreatingDivision(false);
  }
};


const toggleDivisionStatus = async (
  division
) => {
  const divisionId =
    Number(division.division_id);

  const nextStatus =
    Number(division.is_active) === 1
      ? 0
      : 1;

  try {
    setUpdatingDivisionId(
      divisionId
    );

    setMessage("");

    const response = await api.put(
      `/administrator/divisions/${divisionId}`,
      {
        division_name:
          division.division_name,

        is_active:
          nextStatus,
      }
    );

    setMessage(
      response.data.message ||
        "Division updated successfully."
    );

    setDivisions((previous) =>
      previous.map((item) =>
        Number(item.division_id) ===
        divisionId
          ? {
              ...item,
              is_active:
                nextStatus,
            }
          : item
      )
    );

    if (nextStatus === 0) {
      setSelectedDivisionIds(
        (previous) =>
          previous.filter(
            (id) =>
              Number(id) !==
              divisionId
          )
      );
    }
  } catch (error) {
    setMessage(
      error.response?.data?.error ||
        error.response?.data?.message ||
        "Failed to update Division."
    );
  } finally {
    setUpdatingDivisionId(null);
  }
};

  const handleSingleDepartmentChange =
    (event) => {
      const value =
        Number(
          event.target.value
        );

      setSelectedDepartmentIds(
        value
          ? [value]
          : []
      );
    };

  const handleRoleSelectionChange =
    (event) => {
      const nextRole =
        event.target.value;

      setSelectedRole(
        nextRole
      );
    };

  const updateUserRole =
    async () => {
      if (!selectedUser) {
        return;
      }

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
          error.response?.data?.error ||
            error.response?.data?.message ||
            "Failed to update user role."
        );
      } finally {
        setUpdatingRole(false);
      }
    };

  const updateUserDetails =
    async () => {
      if (!selectedUser) {
        return;
      }

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
        !selectedDepartmentIds.length
      ) {
        setMessage(
          "Please select at least one department."
        );

        return;
      }

      try {
        setUpdatingDetails(true);
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

  ...(normalizeRole(selectedRole) ===
  "admin"
    ? {
        division_ids:
          selectedDivisionIds,
      }
    : {}),
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
          error.response?.data?.error ||
            error.response?.data?.message ||
            "Failed to update user details."
        );
      } finally {
        setUpdatingDetails(false);
      }
    };

  const updateUserPassword =
    async () => {
      if (!selectedUser) {
        return;
      }

      if (
        newPassword.length <
        8
      ) {
        setMessage(
          "Password must be at least 8 characters."
        );

        return;
      }

      try {
        setUpdatingPassword(true);
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
          error.response?.data?.error ||
            error.response?.data?.message ||
            "Failed to update user password."
        );
      } finally {
        setUpdatingPassword(false);
      }
    };

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
          error.response?.data?.error ||
            error.response?.data?.message ||
            "Failed to update user status."
        );
      }
    };

  const resetPassword =
    async (userId) => {
      const confirmReset =
        window.confirm(
          "Reset this user's password to Valencia@123?"
        );

      if (!confirmReset) {
        return;
      }

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
          error.response?.data?.error ||
            error.response?.data?.message ||
            "Failed to reset password."
        );
      }
    };

  const deleteUser =
    async (userId) => {
      const confirmDelete =
        window.confirm(
          "Delete this user permanently?"
        );

      if (!confirmDelete) {
        return;
      }

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
            error.response?.data?.message ||
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

    const rows =
      filteredUsers.map(
        (user) =>
          headers
            .map(
              (header) => {
                let value =
                  user[
                    header
                  ] ||
                  "";

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
                  String(
                    value
                  );

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
              }
            )
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
          type:
            "text/csv;charset=utf-8;",
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

  const getDepartmentDisplay =
    (user) => {
      return (
        user.department_names ||
        user.department_name ||
        "-"
      );
    };

  return (
    <div className="users-page">
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

            Refresh
          </button>

          <button
            type="button"
            className="administrator-users-header-btn"
            onClick={exportUsersCsv}
          >
            <Download size={14} />

            Export CSV
          </button>

          <button
            type="button"
            className="administrator-users-header-btn administrator-users-import-btn"
            onClick={handleImportClick}
            disabled={importing}
          >
            <Upload size={14} />

            {importing
              ? "Importing..."
              : "Import Users"}
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
        <div className="administrator-users-message">
          {message}
        </div>
      )}

      <section className="administrator-add-user-card">
        <div className="administrator-add-user-heading">
          <div>
            <h2>Add Single User</h2>

            <p>
              New users receive default password:
              Valencia@123
            </p>
          </div>

         <div
  style={{
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  }}
>
  <button
    type="button"
    className="administrator-add-department-btn"
    onClick={openAddDepartmentModal}
  >
    <Plus size={15} />

    Add Department
  </button>

  <button
    type="button"
    className="administrator-add-department-btn"
    onClick={openDivisionManager}
  >
    <Plus size={15} />

    Manage Divisions
  </button>
</div> 
        </div>

        <form
          className="administrator-user-form-grid"
          onSubmit={createUser}
        >
          <div className="administrator-form-field">
            <label>Employee Code</label>

            <input
              value="Auto generated"
              disabled
            />
          </div>

          <div className="administrator-form-field">
            <label>Full Name *</label>

            <input
              name="full_name"
              value={form.full_name}
              onChange={handleChange}
              placeholder="Employee name"
              required
            />
          </div>

          <div className="administrator-form-field">
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

          <div className="administrator-form-field">
            <label>Phone</label>

            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="Phone number"
            />
          </div>

          <div className="administrator-form-field">
            <label>Designation</label>

            <input
              name="designation"
              value={form.designation}
              onChange={handleChange}
              placeholder="Designation"
            />
          </div>

          <div className="administrator-form-field">
            <label>Department</label>

            <select
              name="department_name"
              value={form.department_name}
              onChange={handleChange}
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
                      department.department_name
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

          <div className="administrator-form-field">
            <label>Role</label>

            <select
              name="role_name"
              value={form.role_name}
              onChange={handleChange}
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
          {
            filteredUsers.length
          }
        </span>
      </div>

      <div className="administrator-users-table-card">
        {loading ? (
          <div className="administrator-users-loading">
            Loading users...
          </div>
        ) : (
          <table className="administrator-users-table">
            <thead>
              <tr>
                <th>
                  User
                </th>

                <th>
                  Role
                </th>

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
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

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
            <div className="administrator-user-dialog-header">
              <div>
                <h2>
                  {
                    selectedUser.full_name
                  }
                </h2>

                <p>
                  Edit user information,
                  departments, role and password.
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
              <section className="administrator-dialog-section">
                <div className="administrator-dialog-section-heading">
                  <h3>
                    User Details
                  </h3>

                  <p>
                    Update email, designation
                    and department access.
                  </p>
                </div>

                <div className="administrator-user-details-grid">
                  <div className="administrator-dialog-field">
                    <label>
                      Employee Code
                    </label>

                    <div className="administrator-static-field">
                      {selectedUser.employee_code ||
                        "Not generated"}
                    </div>
                  </div>

                  <div className="administrator-dialog-field">
                    <label>
                      Current Role
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

                {[
                  "admin",
                  "employee",
                ].includes(
                  normalizeRole(
                    selectedRole
                  )
                ) ? (
                  <div className="admin-departments-section">
                    <div className="admin-departments-title-row">
                      <div className="admin-departments-header">
                        <h4>
                          Departments
                        </h4>

                        <p>
                          Select all departments
                          this user should belong to.
                        </p>
                      </div>

                      <button
                        type="button"
                        className="administrator-small-add-department-btn"
                        onClick={
                          openAddDepartmentModal
                        }
                      >
                        <Plus
                          size={
                            14
                          }
                        />

                        Add Department
                      </button>
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
                  <div className="administrator-single-department-section">
                    <div className="administrator-department-label-row">
                      <label>
                        Department
                      </label>

                      <button
                        type="button"
                        onClick={
                          openAddDepartmentModal
                        }
                      >
                        <Plus
                          size={
                            13
                          }
                        />

                        Add Department
                      </button>
                    </div>

                    <select
                      value={
                        selectedDepartmentIds[0] ||
                        ""
                      }
                      onChange={
                        handleSingleDepartmentChange
                      }
                    >
                      <option value="">
                        Select department
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

                {normalizeRole(selectedRole) ===
  "admin" && (
  <div
    className="admin-departments-section"
    style={{
      marginTop: "18px",
    }}
  >
    <div className="admin-departments-title-row">
      <div className="admin-departments-header">
        <h4>
          Divisions
        </h4>

        <p>
          Select the Divisions this Admin
          is allowed to manage.
          Division access is separate
          from Department access.
        </p>
      </div>

      <button
        type="button"
        className="administrator-small-add-department-btn"
        onClick={
          openDivisionManager
        }
      >
        <Plus size={14} />

        Manage Divisions
      </button>
    </div>

    <div className="admin-departments-grid">
      {activeDivisions.length >
      0 ? (
        activeDivisions.map(
          (division) => {
            const divisionId =
              Number(
                division.division_id
              );

            const isChecked =
              selectedDivisionIds.includes(
                divisionId
              );

            return (
              <label
                key={
                  division.division_id
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
                    toggleDivision(
                      divisionId
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
                    division.division_name
                  }
                </span>
              </label>
            );
          }
        )
      ) : (
        <div
          style={{
            color: "#64748b",
            fontSize: "13px",
          }}
        >
          No active Divisions available.
        </div>
      )}
    </div>
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
                      size={
                        16
                      }
                    />

                    {updatingDetails
                      ? "Saving..."
                      : "Save Details"}
                  </button>
                </div>
              </section>

              <section className="administrator-dialog-section">
                <div className="administrator-dialog-section-heading">
                  <h3>
                    Change Role
                  </h3>

                  <p>
                    Select the dashboard role
                    this user should have.
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
                      (
                        role
                      ) => (
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
                      size={
                        16
                      }
                    />

                    {updatingRole
                      ? "Saving..."
                      : "Save Role"}
                  </button>
                </div>
              </section>

              <section className="administrator-dialog-section">
                <div className="administrator-dialog-section-heading">
                  <h3>
                    Add Extra Leave
                  </h3>

                  <p>
                    Add additional leave for OT or other approved compensation.
                  </p>
                </div>

                <div className="administrator-leave-action-row">
                  <div className="administrator-leave-action-copy">
                    <strong>
                      Increase available leave
                    </strong>

                    <span>
                      Select a leave type and add extra days to this user.
                    </span>
                  </div>

                  <button
                    type="button"
                    className="administrator-primary-btn"
                    onClick={
                      openExtraLeaveModal
                    }
                  >
                    <Plus size={16} />

                    Add Extra Leave
                  </button>
                </div>
              </section>

              <section className="administrator-dialog-section">
                <div className="administrator-dialog-section-heading">
                  <h3>
                    Reduce Leave
                  </h3>

                  <p>
                    Record already-approved historical leave directly in RMS.
                  </p>
                </div>

                <div className="administrator-leave-action-row">
                  <div className="administrator-leave-action-copy">
                    <strong>
                      Use existing leave balance
                    </strong>

                    <span>
                      Review current balances and save past approved leave.
                    </span>
                  </div>

                  <button
                    type="button"
                    className="administrator-primary-btn"
                    onClick={
                      openReduceLeaveModal
                    }
                  >
                    <MinusCircle
                      size={
                        16
                      }
                    />

                    Reduce Leave
                  </button>
                </div>
              </section>

              <section className="administrator-dialog-section">
                <div className="administrator-dialog-section-heading">
                  <h3>
                    Select Mail To
                  </h3>

                  <p>
                    Choose who should receive this user's Leave Application and Field Visit emails.
                  </p>
                </div>

                <div className="administrator-leave-action-row">
                  <div className="administrator-leave-action-copy">
                    <strong>
                      Configure mail recipients
                    </strong>

                    <span>
                      Current default recipients are already selected unless a custom list has been saved.
                    </span>
                  </div>

                  <button
                    type="button"
                    className="administrator-primary-btn"
                    onClick={
                      openMailRecipientsModal
                    }
                    disabled={
                      loadingMailRecipients
                    }
                  >
                    <Mail size={16} />

                    {loadingMailRecipients
                      ? "Loading..."
                      : "Select Mail To"}
                  </button>
                </div>
              </section>

              <section className="administrator-dialog-section">
                <div className="administrator-dialog-section-heading">
                  <h3>
                    Set New Password
                  </h3>

                  <p>
                    Existing passwords cannot
                    be viewed. Set a new password
                    for this user.
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
                    <Lock size={16} />

                    {updatingPassword
                      ? "Updating..."
                      : "Set Password"}
                  </button>
                </div>
              </section>

              <section className="administrator-dialog-section">
                <div className="administrator-dialog-section-heading">
                  <h3>
                    Account Actions
                  </h3>

                  <p>
                    Reset, block/unblock
                    or remove this account.
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
                    <Lock size={16} />

                    Reset to Default
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

                      Unblock User
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
                      size={
                        16
                      }
                    />

                    Delete User
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {showExtraLeaveModal &&
        selectedUser && (
          <div
            className="administrator-leave-modal-backdrop"
            onMouseDown={
              closeExtraLeaveModal
            }
          >
            <div
              className="administrator-leave-modal"
              onMouseDown={(
                event
              ) =>
                event.stopPropagation()
              }
            >
              <div className="administrator-leave-modal-header">
                <div>
                  <h2>
                    Add Extra Leave
                  </h2>

                  <p>
                    {
                      selectedUser.full_name
                    }
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    closeExtraLeaveModal
                  }
                  disabled={
                    savingExtraLeave
                  }
                >
                  <X size={18} />
                </button>
              </div>

              <div className="administrator-leave-modal-body">
                <div className="administrator-leave-modal-section">
                  <label className="administrator-leave-modal-label">
                    Leave Type
                  </label>

                  <div className="administrator-extra-leave-type-grid">
                    {LEAVE_TYPES.map(
                      (
                        leaveType
                      ) => {
                        const selected =
                          extraLeaveType ===
                          leaveType.value;

                        return (
                          <label
                            key={
                              leaveType.value
                            }
                            className={`administrator-extra-leave-type-option ${
                              selected
                                ? "selected"
                                : ""
                            }`}
                          >
                            <input
                              type="radio"
                              name="extra_leave_type"
                              value={
                                leaveType.value
                              }
                              checked={
                                selected
                              }
                              onChange={(
                                event
                              ) =>
                                setExtraLeaveType(
                                  event
                                    .target
                                    .value
                                )
                              }
                            />

                            <span>
                              {
                                leaveType.label
                              }
                            </span>
                          </label>
                        );
                      }
                    )}
                  </div>
                </div>

                <div className="administrator-leave-modal-section">
                  <label
                    className="administrator-leave-modal-label"
                    htmlFor="administrator-extra-leave-days"
                  >
                    Number of Leaves to Add
                  </label>

                  <input
                    id="administrator-extra-leave-days"
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={
                      extraLeaveDays
                    }
                    onChange={(
                      event
                    ) =>
                      setExtraLeaveDays(
                        event.target
                          .value
                      )
                    }
                    placeholder="Example: 1 or 1.5"
                  />
                </div>

                <div className="administrator-leave-modal-actions">
                  <button
                    type="button"
                    className="administrator-modal-cancel-btn"
                    onClick={
                      closeExtraLeaveModal
                    }
                    disabled={
                      savingExtraLeave
                    }
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="administrator-modal-add-btn"
                    onClick={
                      addExtraLeave
                    }
                    disabled={
                      savingExtraLeave ||
                      !extraLeaveType ||
                      !extraLeaveDays
                    }
                  >
                    {savingExtraLeave
                      ? "Adding..."
                      : "Confirm"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {showMailRecipientsModal &&
        selectedUser && (
          <div
            className="administrator-mail-modal-backdrop"
            onMouseDown={
              closeMailRecipientsModal
            }
          >
            <div
              className="administrator-mail-modal"
              onMouseDown={(
                event
              ) =>
                event.stopPropagation()
              }
            >
              <div className="administrator-mail-modal-header">
                <div>
                  <h2>
                    Select Mail To
                  </h2>

                  <p>
                    {
                      selectedUser.full_name
                    }
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    closeMailRecipientsModal
                  }
                  disabled={
                    savingMailRecipients
                  }
                >
                  <X size={18} />
                </button>
              </div>

              <div className="administrator-mail-modal-body">
                <div className="administrator-mail-group">
                  <div className="administrator-mail-group-heading">
                    <h3>
                      Leave Application
                    </h3>

                    <p>
                      Select who should receive leave application emails for this user.
                    </p>
                  </div>

                  <div className="administrator-mail-users-grid">
                    {mailRecipientUsers.map(
                      (user) => {
                        const userId =
                          Number(
                            user.user_id
                          );

                        const selected =
                          leaveMailRecipientIds.includes(
                            userId
                          );

                        return (
                          <label
                            key={`leave-${userId}`}
                            className={
                              selected
                                ? "administrator-mail-user-card selected"
                                : "administrator-mail-user-card"
                            }
                          >
                            <input
                              type="checkbox"
                              checked={
                                selected
                              }
                              onChange={() =>
                                toggleLeaveMailRecipient(
                                  userId
                                )
                              }
                            />

                            <span className="administrator-mail-checkbox">
                              {selected
                                ? "✓"
                                : ""}
                            </span>

                            <span className="administrator-mail-user-copy">
                              <strong>
                                {
                                  user.full_name
                                }
                              </strong>

                              <small>
                                {
                                  user.email
                                }
                              </small>

                              <small>
                                {user.role_name ||
                                  "-"}
                                {user.department_name
                                  ? ` • ${user.department_name}`
                                  : ""}
                              </small>
                            </span>
                          </label>
                        );
                      }
                    )}
                  </div>
                </div>

                <div className="administrator-mail-group">
                  <div className="administrator-mail-group-heading">
                    <h3>
                      Field Visit
                    </h3>

                    <p>
                      Select who should receive Field Visit emails for this user.
                    </p>
                  </div>

                  <div className="administrator-mail-users-grid">
                    {mailRecipientUsers.map(
                      (user) => {
                        const userId =
                          Number(
                            user.user_id
                          );

                        const selected =
                          fieldVisitMailRecipientIds.includes(
                            userId
                          );

                        return (
                          <label
                            key={`field-${userId}`}
                            className={
                              selected
                                ? "administrator-mail-user-card selected"
                                : "administrator-mail-user-card"
                            }
                          >
                            <input
                              type="checkbox"
                              checked={
                                selected
                              }
                              onChange={() =>
                                toggleFieldVisitMailRecipient(
                                  userId
                                )
                              }
                            />

                            <span className="administrator-mail-checkbox">
                              {selected
                                ? "✓"
                                : ""}
                            </span>

                            <span className="administrator-mail-user-copy">
                              <strong>
                                {
                                  user.full_name
                                }
                              </strong>

                              <small>
                                {
                                  user.email
                                }
                              </small>

                              <small>
                                {user.role_name ||
                                  "-"}
                                {user.department_name
                                  ? ` • ${user.department_name}`
                                  : ""}
                              </small>
                            </span>
                          </label>
                        );
                      }
                    )}
                  </div>
                </div>

                <div className="administrator-mail-modal-actions">
                  <button
                    type="button"
                    className="administrator-action-btn"
                    onClick={
                      closeMailRecipientsModal
                    }
                    disabled={
                      savingMailRecipients
                    }
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="administrator-primary-btn"
                    onClick={
                      saveMailRecipients
                    }
                    disabled={
                      savingMailRecipients
                    }
                  >
                    <Save size={16} />

                    {savingMailRecipients
                      ? "Saving..."
                      : "Save Mail To"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {showReduceLeaveModal &&
        selectedUser && (
          <div
            className="administrator-leave-modal-backdrop"
            onMouseDown={
              closeReduceLeaveModal
            }
          >
            <div
              className="administrator-leave-modal administrator-reduce-leave-modal"
              onMouseDown={(
                event
              ) =>
                event.stopPropagation()
              }
            >
              <div className="administrator-leave-modal-header">
                <div>
                  <h2>
                    Reduce Leave
                  </h2>

                  <p>
                    {
                      selectedUser.full_name
                    }
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    closeReduceLeaveModal
                  }
                  disabled={
                    savingReduceLeave ||
                    loadingLeaveBalances
                  }
                >
                  <X size={18} />
                </button>
              </div>

              <div className="administrator-leave-modal-body">
                {loadingLeaveBalances ? (
                  <div className="administrator-leave-loading">
                    Loading leave balances...
                  </div>
                ) : (
                  <>
                    <div className="administrator-leave-balance-grid">
                      {LEAVE_TYPES.map(
                        (
                          leaveType
                        ) => {
                          const balance =
                            leaveBalances?.[
                              leaveType
                                .value
                            ] ||
                            {};

                          const total =
                            balance.total ??
                            balance.earned ??
                            0;

                          const used =
                            balance.used ??
                            0;

                          const pending =
                            balance.pending ??
                            0;

                          const available =
                            balance.available ??
                            balance.remaining ??
                            0;

                          return (
                            <div
                              key={
                                leaveType.value
                              }
                              className="administrator-leave-balance-card"
                            >
                              <div className="administrator-leave-balance-card-header">
                                <h3>
                                  {
                                    leaveType.label
                                  }
                                </h3>
                              </div>

                              <div className="administrator-leave-balance-stats">
                                <div>
                                  <span>
                                    Total
                                  </span>

                                  <strong>
                                    {
                                      total
                                    }
                                  </strong>
                                </div>

                                <div>
                                  <span>
                                    Used
                                  </span>

                                  <strong>
                                    {
                                      used
                                    }
                                  </strong>
                                </div>

                                <div>
                                  <span>
                                    Pending
                                  </span>

                                  <strong>
                                    {
                                      pending
                                    }
                                  </strong>
                                </div>

                                <div>
                                  <span>
                                    Available
                                  </span>

                                  <strong>
                                    {
                                      available
                                    }
                                  </strong>
                                </div>
                              </div>

                              <button
                                type="button"
                                className="administrator-primary-btn administrator-leave-card-action"
                                onClick={() =>
                                  openReduceLeaveFormForType(
                                    leaveType.value
                                  )
                                }
                                disabled={
                                  Number(
                                    available
                                  ) <=
                                  0
                                }
                              >
                                Apply
                              </button>
                            </div>
                          );
                        }
                      )}
                    </div>

                    {!showReduceLeaveForm && (
                      <div className="administrator-leave-modal-actions">
                        <button
                          type="button"
                          className="administrator-modal-cancel-btn"
                          onClick={
                            closeReduceLeaveModal
                          }
                        >
                          Close
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      {showReduceLeaveForm &&
        selectedUser && (
          <div
            className="administrator-leave-form-backdrop"
            onMouseDown={
              closeReduceLeaveForm
            }
          >
            <div
              className="administrator-leave-modal administrator-reduce-leave-form-modal"
              onMouseDown={(
                event
              ) =>
                event.stopPropagation()
              }
            >
              <div className="administrator-leave-modal-header">
                <div>
                  <h2>
                    Record{" "}
                    {
                      LEAVE_TYPES.find(
                        (
                          item
                        ) =>
                          item.value ===
                          reduceLeaveType
                      )?.label
                    }
                  </h2>

                  <p>
                    Save already-approved historical leave for{" "}
                    {
                      selectedUser.full_name
                    }
                    .
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    closeReduceLeaveForm
                  }
                  disabled={
                    savingReduceLeave
                  }
                >
                  <X size={18} />
                </button>
              </div>

              <div className="administrator-leave-modal-body">
                <div className="administrator-reduce-form-grid">
                  <div className="administrator-leave-modal-section administrator-reduce-form-full">
                    <label className="administrator-leave-modal-label">
                      Duration
                    </label>

                    <div className="administrator-duration-options">
                      <label
                        className={`administrator-duration-option ${
                          reduceDurationType ===
                          "full_day"
                            ? "selected"
                            : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="reduce_duration_type"
                          value="full_day"
                          checked={
                            reduceDurationType ===
                            "full_day"
                          }
                          onChange={() => {
                            setReduceDurationType(
                              "full_day"
                            );
                          }}
                        />

                        <span>
                          Full Day
                        </span>
                      </label>

                      <label
                        className={`administrator-duration-option ${
                          reduceDurationType ===
                          "half_day"
                            ? "selected"
                            : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="reduce_duration_type"
                          value="half_day"
                          checked={
                            reduceDurationType ===
                            "half_day"
                          }
                          onChange={() => {
                            setReduceDurationType(
                              "half_day"
                            );

                            if (
                              reduceStartDate
                            ) {
                              setReduceEndDate(
                                reduceStartDate
                              );
                            }
                          }}
                        />

                        <span>
                          Half Day
                        </span>
                      </label>
                    </div>
                  </div>

                  {reduceDurationType ===
                    "half_day" && (
                    <div className="administrator-leave-modal-section administrator-reduce-form-full">
                      <label className="administrator-leave-modal-label">
                        Half Day Session
                      </label>

                      <select
                        value={
                          reduceHalfDaySession
                        }
                        onChange={(
                          event
                        ) =>
                          setReduceHalfDaySession(
                            event
                              .target
                              .value
                          )
                        }
                      >
                        <option value="first_half">
                          First Half
                        </option>

                        <option value="second_half">
                          Second Half
                        </option>
                      </select>
                    </div>
                  )}

                  <div className="administrator-leave-modal-section">
                    <label className="administrator-leave-modal-label">
                      From Date
                    </label>

                    <input
                      type="date"
                      max={
                        getIndiaToday()
                      }
                      value={
                        reduceStartDate
                      }
                      onChange={(
                        event
                      ) => {
                        const value =
                          event
                            .target
                            .value;

                        setReduceStartDate(
                          value
                        );

                        if (
                          reduceDurationType ===
                          "half_day"
                        ) {
                          setReduceEndDate(
                            value
                          );
                        } else if (
                          reduceEndDate &&
                          reduceEndDate <
                            value
                        ) {
                          setReduceEndDate(
                            ""
                          );
                        }
                      }}
                    />
                  </div>

                  <div className="administrator-leave-modal-section">
                    <label className="administrator-leave-modal-label">
                      To Date
                    </label>

                    <input
                      type="date"
                      max={
                        getIndiaToday()
                      }
                      min={
                        reduceStartDate ||
                        undefined
                      }
                      value={
                        reduceDurationType ===
                        "half_day"
                          ? reduceStartDate
                          : reduceEndDate
                      }
                      disabled={
                        reduceDurationType ===
                        "half_day"
                      }
                      onChange={(
                        event
                      ) =>
                        setReduceEndDate(
                          event
                            .target
                            .value
                        )
                      }
                    />
                  </div>

                  <div className="administrator-leave-days-summary administrator-reduce-form-full">
                    <span>
                      Leave Days
                    </span>

                    <strong>
                      {
                        calculateReductionDays()
                      }
                    </strong>
                  </div>
                </div>

                <div className="administrator-leave-modal-actions">
                  <button
                    type="button"
                    className="administrator-modal-cancel-btn"
                    onClick={
                      closeReduceLeaveForm
                    }
                    disabled={
                      savingReduceLeave
                    }
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="administrator-modal-add-btn"
                    onClick={
                      saveReducedLeave
                    }
                    disabled={
                      savingReduceLeave ||
                      !reduceStartDate ||
                      (
                        reduceDurationType ===
                          "full_day" &&
                        !reduceEndDate
                      ) ||
                      calculateReductionDays() <=
                        0
                    }
                  >
                    {savingReduceLeave
                      ? "Saving..."
                      : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {showAddDepartment && (
        <div
          className="administrator-department-modal-backdrop"
          onMouseDown={
            closeAddDepartmentModal
          }
        >
          <div
            className="administrator-department-modal"
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <div className="administrator-department-modal-header">
              <div>
                <h2>
                  Add Department
                </h2>

                <p>
                  Create a new company department.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  closeAddDepartmentModal
                }
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={
                createDepartment
              }
              className="administrator-department-modal-body"
            >
              <div className="administrator-department-modal-field">
                <label>
                  Department Name *
                </label>

                <input
                  autoFocus
                  name="department_name"
                  value={
                    departmentForm.department_name
                  }
                  onChange={
                    handleDepartmentFormChange
                  }
                  placeholder="Example: HR"
                  required
                />
              </div>

              <div className="administrator-department-modal-field">
                <label>
                  Description
                </label>

                <textarea
                  name="description"
                  value={
                    departmentForm.description
                  }
                  onChange={
                    handleDepartmentFormChange
                  }
                  placeholder="Optional description"
                  rows={3}
                />
              </div>

              <div className="administrator-department-modal-actions">
                <button
                  type="button"
                  className="administrator-modal-cancel-btn"
                  onClick={
                    closeAddDepartmentModal
                  }
                  disabled={
                    creatingDepartment
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="administrator-modal-add-btn"
                  disabled={
                    creatingDepartment
                  }
                >
                  <Plus size={15} />

                  {creatingDepartment
                    ? "Adding..."
                    : "Add Department"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDivisionManager && (
  <div
    className="administrator-department-modal-backdrop"
    onMouseDown={
      closeDivisionManager
    }
  >
    <div
      className="administrator-department-modal"
      onMouseDown={(event) =>
        event.stopPropagation()
      }
    >
      <div className="administrator-department-modal-header">
        <div>
          <h2>
            Manage Divisions
          </h2>

          <p>
            Create Divisions and control
            whether they are active.
          </p>
        </div>

        <button
          type="button"
          onClick={
            closeDivisionManager
          }
          disabled={
            creatingDivision ||
            Boolean(
              updatingDivisionId
            )
          }
        >
          <X size={18} />
        </button>
      </div>

      <div className="administrator-department-modal-body">
        <form
          onSubmit={
            createDivision
          }
        >
          <div className="administrator-department-modal-field">
            <label>
              New Division
            </label>

            <input
              value={
                newDivisionName
              }
              onChange={(event) =>
                setNewDivisionName(
                  event.target.value
                )
              }
              placeholder="Example: Crunzzo"
            />
          </div>

          <div
            className="administrator-department-modal-actions"
            style={{
              marginBottom: "18px",
            }}
          >
            <button
              type="submit"
              className="administrator-modal-add-btn"
              disabled={
                creatingDivision ||
                !newDivisionName.trim()
              }
            >
              <Plus size={15} />

              {creatingDivision
                ? "Adding..."
                : "Add Division"}
            </button>
          </div>
        </form>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {visibleDivisions.map(
            (division) => {
              const isActive =
                Number(
                  division.is_active
                ) === 1;

              const isUpdating =
                Number(
                  updatingDivisionId
                ) ===
                Number(
                  division.division_id
                );

              return (
                <div
                  key={
                    division.division_id
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent:
                      "space-between",
                    gap: "12px",
                    padding:
                      "12px 14px",
                    border:
                      "1px solid #e2e8f0",
                    borderRadius:
                      "10px",
                  }}
                >
                  <div>
                    <strong>
                      {
                        division.division_name
                      }
                    </strong>

                    <div
                      style={{
                        marginTop:
                          "3px",
                        fontSize:
                          "12px",
                        color:
                          isActive
                            ? "#15803d"
                            : "#64748b",
                      }}
                    >
                      {isActive
                        ? "Active"
                        : "Inactive"}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="administrator-action-btn"
                    onClick={() =>
                      toggleDivisionStatus(
                        division
                      )
                    }
                    disabled={
                      isUpdating
                    }
                  >
                    {isUpdating
                      ? "Saving..."
                      : isActive
                      ? "Deactivate"
                      : "Activate"}
                  </button>
                </div>
              );
            }
          )}

          {visibleDivisions.length ===
            0 && (
            <div
              style={{
                padding:
                  "14px 0",
                color:
                  "#64748b",
              }}
            >
              No Divisions created yet.
            </div>
          )}
        </div>

        <div className="administrator-department-modal-actions">
          <button
            type="button"
            className="administrator-modal-cancel-btn"
            onClick={
              closeDivisionManager
            }
            disabled={
              creatingDivision ||
              Boolean(
                updatingDivisionId
              )
            }
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
)}
    </div>
  );
};

export default AdministratorUsers;