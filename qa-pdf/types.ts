export interface IngredientListRow {
  id: string;
  ingredient: string;
  reason: string;
  product_count: number;
  list_kind: "avoid" | "favourite";
}
