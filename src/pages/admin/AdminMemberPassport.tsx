import { useNavigate, useParams } from "react-router-dom";
import { smartBack } from "@/lib/smartBack";
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
      accessEndedAction={smartBack(nav, "/admin/members")}
    />
  );
};

export default AdminMemberPassport;
