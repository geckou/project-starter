/** ユーザー */
export type User = {
  id: string;
  displayName: string;
  email: string;
  createdAt: Date;
};

/** API レスポンスの共通型 */
export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};
