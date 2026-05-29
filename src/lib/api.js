async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "요청 처리 중 오류가 발생했습니다.");
    error.status = response.status;
    error.code = data.code || "";
    error.serverMessage = data.error || "";
    throw error;
  }
  return data;
}

function csrfToken() {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function jsonHeaders() {
  const token = csrfToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { "X-CSRF-Token": token } : {})
  };
}

export async function getJson(path) {
  return parseJson(await fetch(path));
}

export async function postJson(path, payload = {}) {
  return parseJson(
    await fetch(path, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(payload)
    })
  );
}

export async function putJson(path, payload = {}) {
  return parseJson(
    await fetch(path, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify(payload)
    })
  );
}

export async function deleteJson(path) {
  return parseJson(await fetch(path, { method: "DELETE", headers: csrfToken() ? { "X-CSRF-Token": csrfToken() } : {} }));
}
