import { useNavigate, useParams } from "react-router-dom";
import PassportView from "@/components/passport/PassportView";

const AdminMemberPassport = () => {
  const nav = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  if (!userId) return null;
  return (
    <PassportView
      userId={userId}
      mode="admin"
      backTo="/admin/members"
      active
      accessEndedAction={() => nav("/admin/members")}
    />
  );
};

export default AdminMemberPassport;
