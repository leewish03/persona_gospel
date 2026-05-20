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

export async function getJson(path) {
  return parseJson(await fetch(path));
}

export async function postJson(path, payload = {}) {
  return parseJson(
    await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
  );
}

export async function putJson(path, payload = {}) {
  return parseJson(
    await fetch(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
  );
}

export async function deleteJson(path) {
  return parseJson(await fetch(path, { method: "DELETE" }));
}
