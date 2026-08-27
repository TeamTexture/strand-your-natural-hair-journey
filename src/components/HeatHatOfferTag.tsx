// Promotional tag shown on the splash + welcome-back screens.
// Replaces the "Built with insights from How To Love Your Afro" block.
// Per STRAND rules: any reference to the TT Heat Hat links to Team Texture.

import { Tag } from "lucide-react";

const TEAM_TEXTURE_URL = "https://www.teamtexture.co.uk";

/**
 * A small promotional chip advertising the member discount on Team Texture
 * Heat Hats. Main line is the offer; the muted line is the expiry date.
 */
const HeatHatOfferTag = () => (
  <div className="mt-6 flex flex-col items-center gap-1.5 text-center">
    <a
      href={TEAM_TEXTURE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-full bg-primary px-3.5 py-2 max-w-[300px] hover:bg-primary/90 transition-colors"
    >
      <Tag className="size-3.5 shrink-0 text-primary-foreground" aria-hidden />
      <span className="font-body text-[12px] font-bold uppercase leading-tight text-primary-foreground">
        Subscribe for 15% off TT Heat Hats
      </span>
    </a>
    <p className="text-[10.5px] font-body text-muted-foreground">
      until September 1st 2026
    </p>
  </div>
);

export default HeatHatOfferTag;
