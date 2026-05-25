import OpenAI from "openai";

let shared: OpenAI | null = null;
let sharedKey = "";

export function getPlanningOpenAiClient(apiKey: string): OpenAI {
  const k = apiKey.trim();
  if (k === "") {
    throw new Error("Planning OpenAI: empty API key");
  }
  if (!shared || sharedKey !== k) {
    sharedKey = k;
    shared = new OpenAI({ apiKey: k });
  }
  return shared;
}
