export interface AbstractApiError extends Error {
  statusCode?: number;
}
