export interface RegisterDto {
  /** Nama tampilan - disimpan ke kolom username (login tetap by email) */
  name: string;
  email: string;
  /** Digit internasional tanpa '+', mis. 6289988887777 - atau null */
  phone: string | null;
  password: string;
}
