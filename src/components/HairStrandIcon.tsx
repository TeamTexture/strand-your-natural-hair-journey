interface Props {
  className?: string;
}

const HairStrandIcon = ({ className }: Props) => (
  <svg
    viewBox="0 0 80 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Curved hair strand — single flowing coil */}
    <path
      d="M40 6 C 56 14, 60 30, 46 40 C 32 50, 28 64, 44 74"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M40 6 C 24 14, 20 30, 34 40 C 48 50, 52 64, 36 74"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      fill="none"
      opacity="0.55"
    />
  </svg>
);

export default HairStrandIcon;
