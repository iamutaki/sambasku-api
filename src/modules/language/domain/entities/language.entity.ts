export interface Language {
  id: string;
  code: string;
  name: string;
  nativeName: string | null;
  isActive: boolean;
}

export interface Dialect {
  id: string;
  languageId: string;
  code: string;
  name: string;
  isActive: boolean;
}
