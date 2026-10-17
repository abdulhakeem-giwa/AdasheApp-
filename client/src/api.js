const BASE = "/api";

function getToken() {
  return localStorage.getItem("adashe_token");
}

export function setToken(token) {
  if (token) localStorage.setItem("adashe_token", token);
  else localStorage.removeItem("adashe_token");
}

async function request(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`);
    err.data = data; // preserves extra fields like requiresVerification/userId/otpCode
    throw err;
  }
  return data;
}

export const api = {
  register: (payload) => request("/auth/register", { method: "POST", body: payload }),
  login: (identifier, password) => request("/auth/login", { method: "POST", body: { identifier, password } }),
  verifyOtp: (userId, code) => request("/auth/verify-otp", { method: "POST", body: { userId, code } }),
  resendOtp: (userId) => request("/auth/resend-otp", { method: "POST", body: { userId } }),
  me: () => request("/auth/me"),
  forgotPassword: (identifier) => request("/auth/forgot-password", { method: "POST", body: { identifier } }),
  resetPassword: (id, token, newPassword) =>
    request("/auth/reset-password", { method: "POST", body: { id, token, newPassword } }),
  getConfig: () => request("/config"),

  myGroups: () => request("/groups"),
  createGroup: (payload) => request("/groups", { method: "POST", body: payload }),
  getGroup: (id) => request(`/groups/${id}`),
  joinGroup: (payload) => request("/groups/join", { method: "POST", body: payload }),
  inviteByContact: (groupId, payload) => request(`/groups/${groupId}/invite`, { method: "POST", body: payload }),
  reviewMember: (groupId, memberId, action) =>
    request(`/groups/${groupId}/members/${memberId}`, { method: "PATCH", body: { action } }),
  setOrder: (groupId, order, forceStart = false) =>
    request(`/groups/${groupId}/order`, { method: "PUT", body: { order, forceStart } }),
  suggestOrder: (groupId) => request(`/groups/${groupId}/suggest-order`),
  startNewRotation: (groupId) => request(`/groups/${groupId}/start-new-rotation`, { method: "POST" }),

  freezeGroup: (groupId, action) => request(`/groups/${groupId}/freeze`, { method: "PATCH", body: { action } }),
  freezeMember: (groupId, memberId, action) =>
    request(`/groups/${groupId}/members/${memberId}/freeze`, { method: "PATCH", body: { action } }),
  submitPreference: (groupId, slot) =>
    request(`/groups/${groupId}/my-preference`, { method: "PATCH", body: { slot } }),

  getLedger: (groupId) => request(`/groups/${groupId}/ledger`),
  payDeposit: (groupId) => request(`/groups/${groupId}/deposit`, { method: "POST" }),
  contribute: (groupId, roundId) =>
    request(`/groups/${groupId}/rounds/${roundId}/contribute`, { method: "POST" }),
  confirmPayout: (groupId, roundId, allowPartial = false) =>
    request(`/groups/${groupId}/rounds/${roundId}/confirm-payout`, { method: "PATCH", body: { allowPartial } }),
  checkOverdue: (groupId, roundId) =>
    request(`/groups/${groupId}/rounds/${roundId}/check-overdue`, { method: "POST" }),

  getNotifications: () => request("/notifications"),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () => request("/notifications/read-all", { method: "PATCH" }),
};

// Separate from the JSON `api` object above because file downloads need
// blob handling, not JSON parsing, and must still attach the auth token
// manually since this isn't a plain <a href> link.
export async function downloadLedgerPdf(groupId, groupName) {
  const token = getToken();
  const res = await fetch(`${BASE}/groups/${groupId}/ledger/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to generate ledger PDF");
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ledger-${(groupName || "group").replace(/\s+/g, "_")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
