import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";

const LeaveReview = () => {

  const { token } = useParams();
  const navigate = useNavigate();

  useEffect(() => {

    const load = async () => {
      try {
        const response = await api.get(`/leave-review/${token}`);

        const leaveId = response.data?.leave?.leave_id;

        if (leaveId) {
          localStorage.setItem(
            "openLeaveAfterLogin",
            String(leaveId)
          );

          localStorage.setItem(
            "redirectAfterLogin",
            `/admin/leave-applications?openLeave=${leaveId}`
          );

          navigate(
            `/admin/leave-applications?openLeave=${leaveId}`,
            { replace:true }
          );
        }

      } catch(error) {
        console.error(error);
      }
    };

    load();

  }, [token, navigate]);

  return null;
};

export default LeaveReview;
