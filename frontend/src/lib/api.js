import axios from "axios";

// Unset in dev: same-origin "/api", which the CRA dev server proxies to the
// API (package.json "proxy"). Set it only for a build served elsewhere.
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL ?? "";

// The admin session is an HttpOnly cookie set by /auth/login: the browser sends
// it by itself and no JavaScript ever sees the token. withCredentials only
// matters for a build talking to an API on another origin.
export const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  withCredentials: true,
});

// A 401 anywhere but the login form means no session (never logged in, expired,
// logged out elsewhere): back to login, whichever admin action hit it.
api.interceptors.response.use(undefined, (err) => {
  if (err.response?.status === 401 && err.config?.url !== "/auth/login") {
    window.location.assign("/admin");
  }
  return Promise.reject(err);
});

// The API answers errors as { detail } (business rules, Stripe, rate limit)
// or, for rejected input, as ASP.NET validation problems { errors: { Field: [msg] } }.
export function errorMessage(err, fallback = "Errore") {
  const data = err?.response?.data;
  if (typeof data?.detail === "string") return data.detail;
  const first = data?.errors && Object.values(data.errors).flat()[0];
  return typeof first === "string" ? first : fallback;
}
