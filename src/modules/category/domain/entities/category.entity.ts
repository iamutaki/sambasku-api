export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
}
