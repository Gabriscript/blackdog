import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

export function authHeader() {
  const t = localStorage.getItem("bd_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export function setToken(t) {
  if (t) localStorage.setItem("bd_token", t);
  else localStorage.removeItem("bd_token");
}

export function getToken() {
  return localStorage.getItem("bd_token");
}
