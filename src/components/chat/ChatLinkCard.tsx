// A tappable link card inside a chat bubble.
//
// Not a new message kind — a normal `text` message whose `meta.link` carries a
// url and a label (the same pattern `booking_request` uses). Anywhere the meta
// isn't read (notification previews, email digests) the plain body still says
// everything, so nothing is lost.
import { ArrowUpRight } from "lucide-react";

interface Props {
  url: string;
  label: string;
  note?: string | null;
}

const ChatLinkCard = ({ url, label, note }: Props) => (
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    className="block rounded-2xl border border-border bg-card px-3 py-2.5 transition-transform active:scale-[0.99]"
  >
    <p className="font-display text-[13.5px] leading-tight text-foreground break-words">
      {label}
    </p>
    {note && (
      <p className="mt-0.5 font-body text-[11px] leading-snug text-muted-foreground break-words">
        {note}
      </p>
    )}
    <span className="mt-2 inline-flex items-center gap-1 rounded-pill bg-primary px-3 h-7 text-[11px] font-body font-semibold text-primary-foreground">
      Open <ArrowUpRight className="size-3" />
    </span>
  </a>
);

export default ChatLinkCard;
