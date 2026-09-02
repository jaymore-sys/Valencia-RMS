import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";

const LeaveReview = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const [leave, setLeave] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const authToken =
      sessionStorage.getItem("token") ||
      localStorage.getItem("token");

    if (!authToken) {
      localStorage.setItem(
        "redirectAfterLogin",
        `/leave-review/${token}`
      );
      navigate("/login", { replace: true });
      return;
    }

    const loadLeave = async () => {
      try {
        const response = await api.get(
          `/leave-review/${token}`
        );

        setLeave(response.data.leave);
      } catch (err) {
        setError(
          err.response?.data?.message ||
          "Unable to load leave request."
        );
      } finally {
        setLoading(false);
      }
    };

    loadLeave();
  }, [token, navigate]);

  if (loading) {
    return <div style={{padding:40}}>Loading...</div>;
  }

  if (error) {
    return <div style={{padding:40,color:"red"}}>{error}</div>;
  }

  return (
    <div style={{padding:40,background:"#f7f8fc",minHeight:"100vh"}}>
      <div style={{background:"#fff",padding:30,borderRadius:20,maxWidth:700,margin:"auto"}}>
        <h2>Leave Request Review</h2>

        <p>Employee: <b>{leave.employee_name}</b></p>
        <p>Leave Type: <b>{leave.leave_type}</b></p>
        <p>From: <b>{leave.start_date}</b></p>
        <p>To: <b>{leave.end_date}</b></p>
        <p>Reason: <b>{leave.reason}</b></p>
        <p>Status: <b>{leave.status}</b></p>

        <button
          onClick={() => navigate("/admin/leave-applications")}
          style={{
            background:"#ff5733",
            color:"#fff",
            border:0,
            padding:"12px 20px",
            borderRadius:12,
            fontWeight:800
          }}
        >
          Open RMS Leave Approval
        </button>
      </div>
    </div>
  );
};

export default LeaveReview;
