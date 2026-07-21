import { useNavigate, useParams } from "react-router-dom";
import PassportView from "@/components/passport/PassportView";
import { useAuth } from "@/hooks/useAuth";
import { useProSubscription } from "@/hooks/useProSubscription";

const ProClientPassport = () => {
  const nav = useNavigate();
  const { consumerId } = useParams<{ consumerId: string }>();
  const { user } = useAuth();
  const { isActive, isLoading: subLoading } = useProSubscription();

  if (!consumerId) return null;
  const canView = !!user && !subLoading && isActive;

  return (
    <PassportView
      userId={consumerId}
      mode="pro"
      backTo="/pro/enquiries"
      active={canView}
      subLoading={subLoading}
      showAccessEnded={!subLoading && !isActive}
      accessEndedAction={() => nav("/pro/enquiries")}
    />
  );
};

export default ProClientPassport;
