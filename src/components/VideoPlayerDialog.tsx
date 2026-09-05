import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import VoicePlayer from "@/components/voice/VoicePlayer";


type Props = {
  url: string | null;
  title?: string;
  onClose: () => void;
};

/**
 * Inline video/audio player. Uses native <video>/<audio> tags with playsInline
 * so that iOS Safari plays content in-page instead of hijacking to full screen.
 */
const VideoPlayerDialog = ({ url, title, onClose }: Props) => {
  if (!url) return null;
  const isAudio = /\.(mp3|m4a|wav|aac|ogg)(\?|$)/i.test(url);
  return (
    <Dialog open={!!url} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="p-0 overflow-hidden bg-black border-none max-w-[95vw] w-[95vw] desk:max-w-2xl">
        <VisuallyHidden asChild>
          <DialogTitle>{title ?? "Media player"}</DialogTitle>
        </VisuallyHidden>
        {isAudio ? (
          <div className="p-4 text-white">
            <VoicePlayer url={url} variant="onDark" />
          </div>

        ) : (
          <video
            src={url}
            controls
            autoPlay
            playsInline
            preload="metadata"
            controlsList="nodownload"
            className="w-full h-auto max-h-[80vh] bg-black"
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default VideoPlayerDialog;
