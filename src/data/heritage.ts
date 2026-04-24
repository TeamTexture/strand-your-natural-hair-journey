// Heritage / ethnicity options. Group headers are non-selectable separators.
export type HeritageOption =
  | { kind: "header"; label: string }
  | { kind: "option"; value: string };

export const HERITAGE_OPTIONS: HeritageOption[] = [
  { kind: "option", value: "Prefer not to say" },
  { kind: "header", label: "Black or Black British" },
  { kind: "option", value: "Black British — Caribbean heritage" },
  { kind: "option", value: "Black British — African heritage" },
  { kind: "option", value: "Black British — Jamaican heritage" },
  { kind: "option", value: "Black British — Nigerian heritage" },
  { kind: "option", value: "Black British — Ghanaian heritage" },
  { kind: "option", value: "Black British — Somali heritage" },
  { kind: "option", value: "Black British — Other African" },
  { kind: "option", value: "Black British — Other Caribbean" },
  { kind: "header", label: "Mixed or Multiple" },
  { kind: "option", value: "Mixed — White and Black Caribbean" },
  { kind: "option", value: "Mixed — White and Black African" },
  { kind: "option", value: "Mixed — White and Asian" },
  { kind: "option", value: "Mixed — Other mixed background" },
  { kind: "header", label: "Asian or Asian British" },
  { kind: "option", value: "Asian British — Indian" },
  { kind: "option", value: "Asian British — Pakistani" },
  { kind: "option", value: "Asian British — Bangladeshi" },
  { kind: "option", value: "Asian British — Chinese" },
  { kind: "option", value: "Asian British — Other Asian" },
  { kind: "header", label: "White" },
  { kind: "option", value: "White British" },
  { kind: "option", value: "White Irish" },
  { kind: "option", value: "White — Other" },
  { kind: "header", label: "Other" },
  { kind: "option", value: "Arab" },
  { kind: "option", value: "Other ethnic background" },
  { kind: "option", value: "Not listed — I will describe" },
];
