import {
  Facebook,
  Instagram,
  MoreHorizontal,
  Music2,
  Newspaper,
  Podcast,
  Search,
  Smartphone,
  Sparkles,
  Users,
  Youtube,
} from "lucide-react";

export interface AcquisitionOption {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * The single list of "How did you find STRAND?" answers, shared by the
 * onboarding step and the one-time retro ask shown to existing members.
 */
export const ACQUISITION_OPTIONS: AcquisitionOption[] = [
  { value: "instagram", label: "Instagram", icon: Instagram },
  { value: "tiktok", label: "TikTok", icon: Music2 },
  { value: "facebook", label: "Facebook", icon: Facebook },
  { value: "youtube", label: "YouTube", icon: Youtube },
  { value: "podcast", label: "Podcast", icon: Podcast },
  { value: "influencer", label: "An influencer / creator I follow", icon: Sparkles },
  { value: "search", label: "Google / web search", icon: Search },
  { value: "app_store", label: "App Store / Google Play search", icon: Smartphone },
  { value: "press", label: "Press / article", icon: Newspaper },
  { value: "friend_family", label: "A friend or family member", icon: Users },
  { value: "other", label: "Something else", icon: MoreHorizontal },
];
