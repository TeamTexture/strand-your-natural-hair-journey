import { useSearchParams } from "react-router-dom";
import PaymentConfirming from "@/components/subscribe/PaymentConfirming";

const DevPaymentStates = () => {
  const [p] = useSearchParams();
  return <PaymentConfirming stalled={p.get("stalled") === "1"} trial onCheckAgain={() => {}} />;
};
export default DevPaymentStates;
