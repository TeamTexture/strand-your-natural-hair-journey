import { useState } from "react";
import Tag from "@/components/Tag";
import ChoiceChips from "@/components/nav/ChoiceChips";
import {
  STYLE_GROUPS,
  NOT_SURE_YET,
  TENSION_CHOICES,
  TENSION_HELPER,
  EXTENSION_CHOICES,
  styleAsksTension,
  styleAsksExtensions,
} from "@/lib/hairstyles";

export interface StyleAttributesValue {
  tension: string | null;
  extensions: boolean | null;
}

/**
 * StylePicker — the single grouped hairstyle picker used everywhere a style is
 * chosen. Options sit under small eyebrow headings for scanability, and the
 * tension / extensions sub-options only render when the selected style calls
 * for them so a step never gets crowded.
 */
const StylePicker = ({
  value,
  onChange,
  attributes,
  onAttributesChange,
  includeNotSureYet = false,
  attributesRequired = true,
  attributeError,
  hideStyleOptions = false,
  collapseOnSelect = false,
}: {
  value: string | null;
  onChange: (next: string) => void;
  attributes: StyleAttributesValue;
  onAttributesChange: (next: StyleAttributesValue) => void;
  includeNotSureYet?: boolean;
  /** Planned/future styles keep the attributes optional. */
  attributesRequired?: boolean;
  attributeError?: boolean;
  /** Attributes-only mode — used for the planned next style, where the style
   *  itself is chosen in a separate dropdown. */
  hideStyleOptions?: boolean;
  /** Once one style is picked, hide every other option and show just the
   *  chosen one with a way back to the full list. */
  collapseOnSelect?: boolean;
}) => {
  const asksTension = styleAsksTension(value);
  const asksExtensions = styleAsksExtensions(value);
  const [expanded, setExpanded] = useState(false);
  const collapsed = collapseOnSelect && !!value && !expanded;

  return (
    <div className="space-y-4">
      {!hideStyleOptions && collapsed && (
        <div className="flex flex-wrap items-center gap-2">
          <Tag selected onClick={() => setExpanded(true)}>
            {value}
          </Tag>
          <button
            type="button"
            className="text-[11px] font-body text-muted-foreground underline underline-offset-4"
            onClick={() => setExpanded(true)}
          >
            Change
          </button>
        </div>
      )}

      {!hideStyleOptions && !collapsed && STYLE_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-1.5">
            {group.label}
          </div>
          <div className="flex flex-wrap gap-2">
            {group.options.map((o) => (
              <Tag key={o} selected={value === o} onClick={() => { onChange(o); setExpanded(false); }}>
                {o}
              </Tag>
            ))}
          </div>
        </div>
      ))}

      {!hideStyleOptions && !collapsed && includeNotSureYet && (
        <div className="flex flex-wrap gap-2">
          <Tag
            selected={value === NOT_SURE_YET}
            onClick={() => { onChange(NOT_SURE_YET); setExpanded(false); }}
          >
            {NOT_SURE_YET}
          </Tag>
        </div>
      )}

      {asksTension && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-1.5">
            Tension{attributesRequired ? "" : " (optional)"}
          </div>
          <ChoiceChips
            options={TENSION_CHOICES}
            value={attributes.tension}
            onChange={(v) => onAttributesChange({ ...attributes, tension: v })}
          />
          <p className="text-[11px] text-muted-foreground mt-1.5">{TENSION_HELPER}</p>
        </div>
      )}

      {asksExtensions && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-1.5">
            Extensions{attributesRequired ? "" : " (optional)"}
          </div>
          <ChoiceChips
            options={EXTENSION_CHOICES}
            value={
              attributes.extensions === null || attributes.extensions === undefined
                ? null
                : attributes.extensions
                  ? "yes"
                  : "no"
            }
            onChange={(v) =>
              onAttributesChange({ ...attributes, extensions: v === "yes" })
            }
          />
        </div>
      )}

      {attributeError && (asksTension || asksExtensions) && (
        <p className="text-[11px] text-destructive">
          Please answer the tension and extensions questions for this style.
        </p>
      )}
    </div>
  );
};

export default StylePicker;
