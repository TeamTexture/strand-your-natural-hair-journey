interface Props {
  children: React.ReactNode;
}
/** Small uppercase gold section label */
const SectionLabel = ({ children }: Props) => (
  <h2 className="text-[11px] uppercase tracking-[0.2em] text-primary font-body font-medium px-5 mt-5 mb-2.5">
    {children}
  </h2>
);
export default SectionLabel;
