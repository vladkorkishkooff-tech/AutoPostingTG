export type ProviderDef = {
  id: string
  name: string
  keyUrl?: string
  baseUrl?: string
  needsBaseUrl?: boolean
  models: { id: string; name: string }[]
}

// «Свой ключ» всегда первый — любой OpenAI-совместимый endpoint
export const PROVIDERS_CATALOG: ProviderDef[] = [
  {
    id: 'custom',
    name: 'Свой ключ (OpenAI-совместимый)',
    needsBaseUrl: true,
    models: [],
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    keyUrl: 'https://platform.openai.com/api-keys',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-5.2', name: 'GPT-5.2' },
      { id: 'gpt-5-mini', name: 'GPT-5 mini' },
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini' },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3 (chat)' },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1 (reasoner)' },
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    keyUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
    baseUrl: 'https://api.minimax.io/v1',
    models: [
      { id: 'MiniMax-M2', name: 'MiniMax M2' },
      { id: 'MiniMax-Text-01', name: 'MiniMax Text 01' },
    ],
  },
  {
    id: 'glm',
    name: 'Zhipu GLM',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-4.6', name: 'GLM-4.6' },
      { id: 'glm-4.5-air', name: 'GLM-4.5 Air' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    keyUrl: 'https://console.groq.com/keys',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
      { id: 'qwen/qwen3-32b', name: 'Qwen3 32B' },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    keyUrl: 'https://console.mistral.ai/api-keys',
    baseUrl: 'https://api.mistral.ai/v1',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large' },
      { id: 'mistral-small-latest', name: 'Mistral Small' },
    ],
  },
  {
    id: 'v0',
    name: 'v0 (Vercel)',
    keyUrl: 'https://v0.app/settings/api-keys',
    baseUrl: 'https://api.v0.dev/v1',
    models: [
      { id: 'v0-1.5-md', name: 'v0-1.5-md (рекомендуется)' },
      { id: 'v0-1.5-lg', name: 'v0-1.5-lg' },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/settings/keys',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3 (free)' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)' },
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (free)' },
    ],
  },
]

export function providerById(id: string): ProviderDef | undefined {
  return PROVIDERS_CATALOG.find((p) => p.id === id)
}
