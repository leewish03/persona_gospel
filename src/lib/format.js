import { goalText, relationshipText, settingText } from "@/lib/constants";

export function formatCount(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

export function formatKrw(value) {
  return `${Math.round(Number(value || 0)).toLocaleString("ko-KR")}원`;
}

export function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

export function formatPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

export function percentOf(part, total) {
  return total > 0 ? (Number(part || 0) / Number(total)) * 100 : 0;
}

export function sessionLabels(session = {}, personas = []) {
  return {
    persona: personas.find((entry) => entry.id === session.personaId)?.name || "페르소나",
    relationship: relationshipText[session.relationship] || session.relationship || "",
    setting: settingText[session.setting] || session.setting || "",
    goal: goalText[session.goal] || session.goal || ""
  };
}

export function usageEventLabel(type = "") {
  return {
    chat_start: "대화 시작",
    chat_message: "메시지",
    feedback: "피드백",
    opening_line_generation: "첫 문장 생성"
  }[type] || type || "기록";
}

export function markdownToHtml(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let listType = "";

  const escape = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const renderInline = (value) => escape(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${paragraph.map(renderInline).join("<br>")}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = "";
  };
  const openList = (type) => {
    flushParagraph();
    if (listType === type) return;
    closeList();
    listType = type;
    html.push(`<${type}>`);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = /^(#{2,3})\s+(.+)$/.exec(line);
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(line);

    if (!line) {
      flushParagraph();
      closeList();
    } else if (heading) {
      flushParagraph();
      closeList();
      html.push(`<h2>${renderInline(heading[2])}</h2>`);
    } else if (bullet) {
      openList("ul");
      html.push(`<li>${renderInline(bullet[1])}</li>`);
    } else if (ordered) {
      openList("ol");
      html.push(`<li>${renderInline(ordered[1])}</li>`);
    } else {
      closeList();
      paragraph.push(line);
    }
  }

  flushParagraph();
  closeList();
  return html.join("");
}
