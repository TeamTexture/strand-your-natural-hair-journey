import { Switch } from "@/components/ui/switch";
import SurfaceCard from "@/components/SurfaceCard";

/**
 * MEDIA SHARING — always its own decision.
 *
 * Never bundled with accepting a plan and never a precondition for following
 * one. Turning it off revokes access only; every photo, video and voice note
 * the member has recorded stays exactly where it is.
 */
const MediaConsentToggle = ({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) => (
  <SurfaceCard className="flex items-start gap-3">
    <div className="min-w-0 flex-1">
      <p className="font-body text-[14px] font-semibold leading-snug [overflow-wrap:anywhere]">
        Let {name} see your photos, videos and voice notes
      </p>
      <p className="font-body text-[12px] text-muted-foreground mt-1 leading-snug">
        You can turn this off at any time. The plan carries on either way, and you keep
        everything you've recorded.
      </p>
    </div>
    <Switch
      checked={value}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={`Share media with ${name}`}
      className="mt-0.5 shrink-0"
    />
  </SurfaceCard>
);

export default MediaConsentToggle;
