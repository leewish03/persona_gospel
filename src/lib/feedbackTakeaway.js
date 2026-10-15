export function feedbackTakeaway(text = "") {
  const section = String(text).split(/^##\s+다음 훈련 과제\s*$/m)[1]?.split(/^##\s/m)[0];
  return section?.split("\n").map(line => line.trim()).find(line => /^[-*]\s+|^\d+[.)]\s+/.test(line))?.replace(/^([-*]|\d+[.)])\s+/, "").replace(/\*\*/g, "") || "";
}
