export function normalizeUsage(usage = {}) {
  return {
    inputTokens: Number(usage.input_tokens || usage.prompt_tokens || 0),
    outputTokens: Number(usage.output_tokens || usage.completion_tokens || 0),
    cacheReadInputTokens: Number(usage.input_tokens_details?.cached_tokens || usage.prompt_tokens_details?.cached_tokens || 0),
    cacheCreationInputTokens: Number(usage.input_tokens_details?.cache_write_tokens || 0),
    reasoningTokens: Number(usage.output_tokens_details?.reasoning_tokens || 0)
  };
}

export function openAiInputCost(inputTokens, cachedTokens, inputPrice, cachedInputPrice = inputPrice, cacheWriteTokens = 0, cacheWritePrice = inputPrice) {
  const total = Math.max(0, Number(inputTokens) || 0);
  const cached = Math.min(total, Math.max(0, Number(cachedTokens) || 0));
  const written = Math.min(total - cached, Math.max(0, Number(cacheWriteTokens) || 0));
  return ((total - cached - written) * inputPrice + cached * cachedInputPrice + written * cacheWritePrice) / 1_000_000;
}
