export function formatConversationContext(messages = []) {
  if (!messages.length) return "아직 대화가 시작되지 않았다.";
  let userTurn = 0;
  let personaTurn = 0;
  return messages.map(message => `${message.role === "user" ? `[사용자 ${++userTurn}]` : `[페르소나 ${++personaTurn}]`}: ${JSON.stringify(message.content)}`).join("\n");
}
