// TEMPORARY preview harness for the payment-confirming states. Removed after screenshots.
import PaymentConfirming from "@/components/subscribe/PaymentConfirming";

const DevPaymentConfirmingPreview = () => {
  const stalled = new URLSearchParams(window.location.search).has("stalled");
  return (
    <PaymentConfirming
      stalled={stalled}
      trial
      onCheckAgain={() => undefined}
      checking={false}
    />
  );
};

export default DevPaymentConfirmingPreview;
