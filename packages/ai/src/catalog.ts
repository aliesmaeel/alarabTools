/**
 * The providers the gateway knows. Keys are entered in the admin dashboard; nothing here is secret.
 * Free allowances are as of September 2026 and only drive the safety-margin meters.
 */
export type Capability = "ocr" | "translate" | "summarize";
export const CAPABILITIES: Capability[] = ["ocr", "translate", "summarize"];

export type FieldDef = { name: string; label: string; secret: boolean; hint?: string; placeholder?: string };
export type Limit = { unit: string; perDay?: number; perMonth?: number; perMinute?: number };

export type ProviderDef = {
  id: string;
  name: string;
  site: string;
  fields: FieldDef[];
  capabilities: Capability[];
  /** Free allowance the meters are drawn against. */
  limit: Limit;
  trainsOnData: boolean;
  /** Free tier terms only allow visitors outside the EEA/UK/CH, and never OCR or API jobs. */
  geoRestricted?: boolean;
  optional?: boolean;
};

export const PROVIDERS: ProviderDef[] = [
  { id: "groq", name: "Groq", site: "console.groq.com", capabilities: ["summarize", "translate"], trainsOnData: false,
    fields: [{ name: "apiKey", label: "API key", secret: true, placeholder: "gsk_…" }],
    limit: { unit: "requests", perDay: 1000, perMinute: 30 } },
  { id: "cloudflare", name: "Cloudflare Workers AI", site: "dash.cloudflare.com", capabilities: ["summarize", "translate"], trainsOnData: false,
    fields: [{ name: "accountId", label: "Account ID", secret: false }, { name: "apiToken", label: "API token", secret: true, hint: "Needs the Workers AI permission" }],
    limit: { unit: "requests", perDay: 300 } },
  { id: "azure-docint", name: "Azure Document Intelligence", site: "portal.azure.com", capabilities: ["ocr"], trainsOnData: false,
    fields: [{ name: "endpoint", label: "Endpoint", secret: false, placeholder: "https://<name>.cognitiveservices.azure.com" }, { name: "apiKey", label: "Key", secret: true }],
    limit: { unit: "pages", perMonth: 500 } },
  { id: "azure-translator", name: "Azure Translator", site: "portal.azure.com", capabilities: ["translate"], trainsOnData: false,
    fields: [{ name: "apiKey", label: "Key", secret: true }, { name: "region", label: "Region", secret: false, placeholder: "westeurope" }],
    limit: { unit: "characters", perMonth: 2_000_000 } },
  { id: "google", name: "Google Cloud (Vision + Translation)", site: "console.cloud.google.com", capabilities: ["ocr", "translate"], trainsOnData: false,
    fields: [{ name: "apiKey", label: "API key", secret: true, hint: "Restrict it to Cloud Vision API and Cloud Translation API" }],
    limit: { unit: "pages", perMonth: 1000 } },
  { id: "ocrspace", name: "OCR.space", site: "ocr.space/ocrapi", capabilities: ["ocr"], trainsOnData: false,
    fields: [{ name: "apiKey", label: "API key", secret: true }],
    limit: { unit: "requests", perMonth: 25_000 } },
  { id: "gemini", name: "Google AI Studio (Gemini)", site: "aistudio.google.com", capabilities: ["summarize", "translate"], trainsOnData: true, geoRestricted: true,
    fields: [{ name: "apiKey", label: "API key", secret: true, hint: "Create it in a project with no billing" }],
    limit: { unit: "requests", perDay: 250 } },
  { id: "mistral", name: "Mistral", site: "console.mistral.ai", capabilities: ["summarize", "translate"], trainsOnData: false, optional: true,
    fields: [{ name: "apiKey", label: "API key", secret: true, hint: "Turn off training on your data in the Mistral settings first" }],
    limit: { unit: "requests", perDay: 500 } },
  { id: "mock", name: "Mock provider (tests)", site: "local", capabilities: ["ocr", "translate", "summarize"], trainsOnData: false, optional: true,
    fields: [{ name: "apiKey", label: "Any value", secret: true }],
    limit: { unit: "requests", perDay: 100000 } },
];

export const providerById = (id: string) => PROVIDERS.find((p) => p.id === id);

/** Default order per capability (from the architecture doc); Gemini always last. */
export const DEFAULT_ROUTING: Record<Capability, string[]> = {
  ocr: ["azure-docint", "google", "ocrspace"],
  translate: ["azure-translator", "google", "cloudflare", "groq", "mistral", "gemini"],
  summarize: ["groq", "cloudflare", "mistral", "gemini"],
};

/** EU, EEA, UK and Switzerland: Gemini's free tier is not offered to visitors here. Unknown counts as Europe. */
export const EUROPE = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH"]);
export function regionOf(country: string | null | undefined): "eu" | "other" {
  if (!country) return "eu";
  return EUROPE.has(country.toUpperCase()) ? "eu" : "other";
}
