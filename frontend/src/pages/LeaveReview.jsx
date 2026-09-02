import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";

const LeaveReview = () => {

  const { token } = useParams();
  const navigate = useNavigate();

  useEffect(() => {

    const load = async () => {

      try {

        const response =
          await api.get(
            `/leave-review/${token}`
          );

        const leave =
          response.data.leave;

        navigate(
          `/admin/leave-applications?openLeave=${leave.leave_id}`,
          {
            replace:true
          }
        );

      } catch(error) {

        console.error(error);

      }

    };

    load();

  }, [token,navigate]);


  return (
    <div style={{padding:40}}>
      Opening leave application...
    </div>
  );

};

export default LeaveReview;
