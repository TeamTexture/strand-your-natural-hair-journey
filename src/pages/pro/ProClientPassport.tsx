import { useNavigate, useParams } from "react-router-dom";
import PassportView from "@/components/passport/PassportView";
import { useAuth } from "@/hooks/useAuth";
import { useProSubscription } from "@/hooks/useProSubscription";
import { useRoles } from "@/hooks/useRoles";

const ProClientPassport = () => {
  const nav = useNavigate();
  const { consumerId } = useParams<{ consumerId: string }>();
  const { user } = useAuth();
  const { isActive, isLoading: subLoading } = useProSubscription();
  const { isAdmin } = useRoles();

  if (!consumerId) return null;
  const effectiveActive = isActive || isAdmin;
  const canView = !!user && (isAdmin || (!subLoading && isActive));

  return (
    <PassportView
      userId={consumerId}
      mode="pro"
      backTo="/pro/enquiries"
      active={canView}
      subLoading={subLoading && !isAdmin}
      showAccessEnded={!isAdmin && !subLoading && !isActive}
      accessEndedAction={() => nav("/pro/enquiries")}
    />
  );
};

export default ProClientPassport;
