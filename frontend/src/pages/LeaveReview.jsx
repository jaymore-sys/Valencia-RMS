import { useEffect } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../api/axios";

/* =========================================================
   GLOBAL LEAVE REVIEWERS
========================================================= */

const GLOBAL_LEAVE_REVIEWER_EMAILS = [
  "manish@valencianutrition.com",
  "premal.mehta@valencianutrition.com",
  "rathika.haleangadi@valencianutrition.com",
];

/* =========================================================
   HELPERS
========================================================= */

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

const getStoredToken = () =>
  sessionStorage.getItem("token") ||
  localStorage.getItem("token") ||
  "";

const clearCurrentLogin = () => {
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user");

  localStorage.removeItem("token");
  localStorage.removeItem("user");
};

/* =========================================================
   COMPONENT
========================================================= */

const LeaveReview = () => {
  const { token } = useParams();

  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        /* =================================================
           1. CHECK CURRENT RMS LOGIN
        ================================================= */

        const authToken =
          getStoredToken();

        const currentUser =
          getStoredUser();

        const roleName = String(
          currentUser?.role_name || ""
        )
          .trim()
          .toLowerCase();

        const email = String(
          currentUser?.email || ""
        )
          .trim()
          .toLowerCase();

        /*
          Allowed reviewers:

          1. Any Admin
          2. Manish
          3. Premal
          4. Rathika

          Employee / Administrator / any other
          account must not continue with the
          currently logged-in session unless
          their email is a global reviewer.
        */

        const isAuthorizedReviewer =
          roleName === "admin" ||
          GLOBAL_LEAVE_REVIEWER_EMAILS.includes(
            email
          );

        /* =================================================
           2. NOT LOGGED IN OR WRONG ACCOUNT
        ================================================= */

        if (
          !authToken ||
          !isAuthorizedReviewer
        ) {
          /*
            Preserve the exact email review link.

            After the reviewer logs in,
            LoginPage will return here first.

            We deliberately return to
            /leave-review/:token rather than
            guessing a leave ID.
          */

          localStorage.setItem(
            "redirectAfterLogin",
            `/leave-review/${token}`
          );

          /*
            Remove stale leave ID from any
            earlier review attempt.
          */

          localStorage.removeItem(
            "openLeaveAfterLogin"
          );

          /*
            If somebody is currently logged
            in as Employee / wrong account,
            log that session out before
            showing the login page.
          */

          if (authToken) {
            clearCurrentLogin();
          }

          if (!cancelled) {
            navigate(
              "/login",
              {
                replace: true,
              }
            );
          }

          return;
        }

        /* =================================================
           3. AUTHORIZED REVIEWER - LOAD LEAVE TOKEN
        ================================================= */

        const response =
          await api.get(
            `/leave-review/${token}`
          );

        if (cancelled) return;

        const leaveId =
          response.data?.leave
            ?.leave_id;

        if (!leaveId) {
          console.error(
            "Leave review token did not return a leave ID."
          );

          return;
        }

        /* =================================================
           4. SAVE EXACT LEAVE
        ================================================= */

        localStorage.setItem(
          "openLeaveAfterLogin",
          String(leaveId)
        );

        /*
          Keep this as the valid destination
          for the dedicated leave approval page.
        */

        const target =
          `/leave-approvals?openLeave=${leaveId}`;

        /*
          Remove any old login redirect so
          it cannot redirect somewhere else
          later.
        */

        localStorage.removeItem(
          "redirectAfterLogin"
        );

        /* =================================================
           5. OPEN EXACT LEAVE APPROVAL
        ================================================= */

        navigate(
          target,
          {
            replace: true,
          }
        );
      } catch (error) {
        console.error(
          "Leave review redirect error:",
          error
        );

        /*
          If authentication became invalid,
          return the reviewer to login while
          preserving this exact email token.
        */

        const status =
          error?.response?.status;

        if (
          status === 401 ||
          status === 403
        ) {
          localStorage.setItem(
            "redirectAfterLogin",
            `/leave-review/${token}`
          );

          localStorage.removeItem(
            "openLeaveAfterLogin"
          );

          clearCurrentLogin();

          if (!cancelled) {
            navigate(
              "/login",
              {
                replace: true,
              }
            );
          }
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [
    token,
    navigate,
  ]);

  return null;
};

export default LeaveReview;